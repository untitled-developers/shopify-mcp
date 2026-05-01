import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { gid, throwOnUserErrors } from "./graphql-helpers.js";

const LOCATION_FIELDS = `id name address { address1 address2 city province country zip } isActive fulfillsOnlineOrders`;
const INVENTORY_LEVEL_FIELDS = `id quantities(names: ["available", "on_hand", "committed", "incoming"]) { name quantity } item { id sku tracked } location { id name }`;

export function registerInventoryTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_locations",
    "List all locations (warehouses, stores, etc.) configured for this Shopify store. Each location has an ID used for inventory operations.",
    {},
    async () => {
      const query = `query ListLocations($first: Int!) { locations(first: $first) { nodes { ${LOCATION_FIELDS} } } }`;
      const data = await client.graphql<{ locations: { nodes: unknown[] } }>(query, { first: 250 });
      return { content: [{ type: "text", text: JSON.stringify(data.locations.nodes, null, 2) }] };
    }
  );

  server.tool(
    "get_location",
    "Get details of a single location by its ID.",
    { location_id: z.string().describe("The numeric Shopify location ID.") },
    async ({ location_id }) => {
      const query = `query GetLocation($id: ID!) { location(id: $id) { ${LOCATION_FIELDS} } }`;
      const data = await client.graphql<{ location: unknown }>(query, { id: gid("Location", location_id) });
      return { content: [{ type: "text", text: JSON.stringify(data.location, null, 2) }] };
    }
  );

  server.tool(
    "list_inventory_levels",
    "List inventory levels (stock quantities) for a given location. Returns available quantities for each inventory item at that location.",
    {
      location_id: z.string().describe("The Shopify location ID to check inventory for."),
      limit: z.number().min(1).max(250).default(50).describe("Number of results (1-250). Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ location_id, limit }) => {
      const query = `
        query InventoryLevels($locationId: ID!, $first: Int!) {
          location(id: $locationId) {
            inventoryLevels(first: $first) {
              nodes { ${INVENTORY_LEVEL_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `;
      const data = await client.graphql<{ location: { inventoryLevels: { nodes: unknown[]; pageInfo: unknown } } }>(query, {
        locationId: gid("Location", location_id),
        first: limit,
      });
      return { content: [{ type: "text", text: JSON.stringify({ inventory_levels: data.location.inventoryLevels.nodes, pageInfo: data.location.inventoryLevels.pageInfo }, null, 2) }] };
    }
  );

  server.tool(
    "adjust_inventory",
    "Adjust inventory by a relative amount (positive to add stock, negative to remove). Requires the inventory_item_id (from a product variant) and location_id.",
    {
      inventory_item_id: z.string().describe("The inventory item ID (found on product variants as `inventory_item_id`)."),
      location_id: z.string().describe("The location ID where inventory is stored."),
      adjustment: z.number().describe("Amount to adjust (positive = add, negative = subtract)."),
    },
    async ({ inventory_item_id, location_id, adjustment }) => {
      const mutation = `
        mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
          inventoryAdjustQuantities(input: $input) {
            inventoryAdjustmentGroup { id createdAt reason changes { name delta } }
            userErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ inventoryAdjustQuantities: { inventoryAdjustmentGroup: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        input: {
          name: "available",
          reason: "correction",
          changes: [{ inventoryItemId: gid("InventoryItem", inventory_item_id), locationId: gid("Location", location_id), delta: adjustment }],
        },
      });
      throwOnUserErrors("inventoryAdjustQuantities", data.inventoryAdjustQuantities.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.inventoryAdjustQuantities.inventoryAdjustmentGroup, null, 2) }] };
    }
  );

  server.tool(
    "set_inventory",
    "Set inventory to an absolute quantity at a given location. This overwrites the current available quantity.",
    {
      inventory_item_id: z.string().describe("The inventory item ID."),
      location_id: z.string().describe("The location ID."),
      available: z.number().describe("The absolute quantity to set."),
    },
    async ({ inventory_item_id, location_id, available }) => {
      const mutation = `
        mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup { id createdAt reason changes { name delta } }
            userErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ inventorySetQuantities: { inventoryAdjustmentGroup: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [{ inventoryItemId: gid("InventoryItem", inventory_item_id), locationId: gid("Location", location_id), quantity: available }],
        },
      });
      throwOnUserErrors("inventorySetQuantities", data.inventorySetQuantities.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.inventorySetQuantities.inventoryAdjustmentGroup, null, 2) }] };
    }
  );
}