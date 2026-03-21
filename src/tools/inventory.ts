import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerInventoryTools(server: McpServer, client: ShopifyClient) {
  // ── List locations ────────────────────────────────────────────────
  server.tool(
    "list_locations",
    "List all locations (warehouses, stores, etc.) configured for this Shopify store. Each location has an ID used for inventory operations.",
    {},
    async () => {
      const data = await client.request<{ locations: unknown[] }>("locations.json");
      return {
        content: [{ type: "text", text: JSON.stringify(data.locations, null, 2) }],
      };
    }
  );

  // ── Get a single location ─────────────────────────────────────────
  server.tool(
    "get_location",
    "Get details of a single location by its ID.",
    {
      location_id: z.string().describe("The numeric Shopify location ID."),
    },
    async ({ location_id }) => {
      const data = await client.request<{ location: unknown }>(`locations/${location_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.location, null, 2) }],
      };
    }
  );

  // ── List inventory levels ─────────────────────────────────────────
  server.tool(
    "list_inventory_levels",
    "List inventory levels (stock quantities) for a given location. Returns available quantities for each inventory item at that location.",
    {
      location_id: z.string().describe("The Shopify location ID to check inventory for."),
      limit: z.number().min(1).max(250).default(50).describe("Number of results (1–250). Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ location_id, limit, page_info }) => {
      const data = await client.request<{ inventory_levels: unknown[] }>("inventory_levels.json", {
        params: { location_ids: location_id, limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.inventory_levels, null, 2) }],
      };
    }
  );

  // ── Adjust inventory level ────────────────────────────────────────
  server.tool(
    "adjust_inventory",
    "Adjust inventory by a relative amount (positive to add stock, negative to remove). Requires the inventory_item_id (from a product variant) and location_id.",
    {
      inventory_item_id: z.string().describe("The inventory item ID (found on product variants as `inventory_item_id`)."),
      location_id: z.string().describe("The location ID where inventory is stored."),
      adjustment: z.number().describe("Amount to adjust (positive = add, negative = subtract)."),
    },
    async ({ inventory_item_id, location_id, adjustment }) => {
      const data = await client.request<{ inventory_level: unknown }>("inventory_levels/adjust.json", {
        method: "POST",
        body: {
          inventory_item_id: Number(inventory_item_id),
          location_id: Number(location_id),
          available_adjustment: adjustment,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.inventory_level, null, 2) }],
      };
    }
  );

  // ── Set inventory level ───────────────────────────────────────────
  server.tool(
    "set_inventory",
    "Set inventory to an absolute quantity at a given location. This overwrites the current available quantity.",
    {
      inventory_item_id: z.string().describe("The inventory item ID."),
      location_id: z.string().describe("The location ID."),
      available: z.number().describe("The absolute quantity to set."),
    },
    async ({ inventory_item_id, location_id, available }) => {
      const data = await client.request<{ inventory_level: unknown }>("inventory_levels/set.json", {
        method: "POST",
        body: {
          inventory_item_id: Number(inventory_item_id),
          location_id: Number(location_id),
          available,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.inventory_level, null, 2) }],
      };
    }
  );
}
