import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerOrderTools(server: McpServer, client: ShopifyClient) {
  // ── List orders ───────────────────────────────────────────────────
  server.tool(
    "list_orders",
    "List orders in the store. By default returns open orders. Use `status` to filter by fulfillment status, and `financial_status` for payment status. Results are paginated.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of orders to return (1–250). Default: 10."),
      status: z.enum(["open", "closed", "cancelled", "any"]).default("any").describe("Order status filter. Default: any."),
      financial_status: z
        .enum(["authorized", "pending", "paid", "partially_paid", "refunded", "voided", "partially_refunded", "any", "unpaid"])
        .optional()
        .describe("Filter by payment status."),
      fulfillment_status: z
        .enum(["shipped", "partial", "unshipped", "any", "unfulfilled"])
        .optional()
        .describe("Filter by fulfillment status."),
      created_at_min: z.string().optional().describe("Minimum creation date (ISO 8601). E.g. '2024-01-01T00:00:00Z'."),
      created_at_max: z.string().optional().describe("Maximum creation date (ISO 8601)."),
      since_id: z.string().optional().describe("Return orders after this ID (for forward pagination)."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, status, financial_status, fulfillment_status, created_at_min, created_at_max, since_id, page_info }) => {
      const data = await client.request<{ orders: unknown[] }>("orders.json", {
        params: { limit, status, financial_status, fulfillment_status, created_at_min, created_at_max, since_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.orders, null, 2) }],
      };
    }
  );

  // ── Get a single order ────────────────────────────────────────────
  server.tool(
    "get_order",
    "Get full details of a single order by its ID, including line items, shipping address, fulfillments, and transactions.",
    {
      order_id: z.string().describe("The numeric Shopify order ID."),
    },
    async ({ order_id }) => {
      const data = await client.request<{ order: unknown }>(`orders/${order_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.order, null, 2) }],
      };
    }
  );

  // ── Update an order ───────────────────────────────────────────────
  server.tool(
    "update_order",
    "Update an existing order. Typically used to add/edit notes or tags. Only provided fields are changed.",
    {
      order_id: z.string().describe("The numeric Shopify order ID."),
      note: z.string().optional().describe("New order note (visible to merchant)."),
      tags: z.string().optional().describe("Comma-separated tags (replaces all existing tags)."),
      email: z.string().optional().describe("Update the customer email on the order."),
    },
    async ({ order_id, ...fields }) => {
      const order: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) order[k] = v;
      }
      const data = await client.request<{ order: unknown }>(`orders/${order_id}.json`, {
        method: "PUT",
        body: { order },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.order, null, 2) }],
      };
    }
  );

  // ── Close an order ────────────────────────────────────────────────
  server.tool(
    "close_order",
    "Close an order. Closed orders are considered completed and no longer active.",
    {
      order_id: z.string().describe("The numeric Shopify order ID to close."),
    },
    async ({ order_id }) => {
      const data = await client.request<{ order: unknown }>(`orders/${order_id}/close.json`, {
        method: "POST",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.order, null, 2) }],
      };
    }
  );

  // ── Cancel an order ───────────────────────────────────────────────
  server.tool(
    "cancel_order",
    "Cancel an order. Optionally specify a reason and whether to send a notification email to the customer. This may also trigger a refund depending on `restock` and refund settings.",
    {
      order_id: z.string().describe("The numeric Shopify order ID to cancel."),
      reason: z
        .enum(["customer", "fraud", "inventory", "declined", "other"])
        .optional()
        .describe("Cancellation reason."),
      email: z.boolean().default(true).describe("Whether to notify the customer by email. Default: true."),
      restock: z.boolean().default(false).describe("Whether to restock the inventory. Default: false."),
    },
    async ({ order_id, reason, email, restock }) => {
      const body: Record<string, unknown> = { email, restock };
      if (reason) body.reason = reason;
      const data = await client.request<{ order: unknown }>(`orders/${order_id}/cancel.json`, {
        method: "POST",
        body,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.order, null, 2) }],
      };
    }
  );

  // ── List order metafields ────────────────────────────────────────
  server.tool(
    "list_order_metafields",
    "List all metafields for an order via GraphQL.",
    {
      order_id: z.string().describe("The numeric Shopify order ID (or GID)."),
      namespace: z.string().optional().describe("Filter by namespace."),
      limit: z.number().min(1).max(100).default(50).describe("Number of metafields to return. Default: 50."),
    },
    async ({ order_id, namespace, limit }) => {
      const gid = order_id.startsWith("gid://") ? order_id : `gid://shopify/Order/${order_id}`;
      const query = `query ($id: ID!, $namespace: String, $first: Int!) {
        order(id: $id) {
          metafields(namespace: $namespace, first: $first) {
            edges {
              node { id namespace key type jsonValue description createdAt updatedAt }
            }
          }
        }
      }`;
      const data = await client.graphql<{
        order: { metafields: { edges: { node: unknown }[] } };
      }>(query, { id: gid, namespace: namespace ?? null, first: limit });
      const metafields = data.order.metafields.edges.map((e) => e.node);
      return {
        content: [{ type: "text", text: JSON.stringify(metafields, null, 2) }],
      };
    }
  );

  // ── Get an order metafield ───────────────────────────────────────
  server.tool(
    "get_order_metafield",
    "Get a single order metafield by namespace and key.",
    {
      order_id: z.string().describe("The numeric Shopify order ID (or GID)."),
      namespace: z.string().describe("Metafield namespace."),
      key: z.string().describe("Metafield key."),
    },
    async ({ order_id, namespace, key }) => {
      const gid = order_id.startsWith("gid://") ? order_id : `gid://shopify/Order/${order_id}`;
      const query = `query ($id: ID!, $namespace: String!, $key: String!) {
        order(id: $id) {
          metafield(namespace: $namespace, key: $key) {
            id namespace key type jsonValue description createdAt updatedAt
          }
        }
      }`;
      const data = await client.graphql<{
        order: { metafield: unknown };
      }>(query, { id: gid, namespace, key });
      return {
        content: [{ type: "text", text: JSON.stringify(data.order.metafield, null, 2) }],
      };
    }
  );

  // ── Set an order metafield ───────────────────────────────────────
  server.tool(
    "set_order_metafield",
    "Create or update an order metafield using metafieldsSet (upsert).",
    {
      order_id: z.string().describe("The numeric Shopify order ID (or GID)."),
      namespace: z.string().optional().describe("Metafield namespace."),
      key: z.string().describe("Metafield key."),
      value: z.string().describe("Metafield value."),
      type: z.string().optional().describe("Metafield type (required when creating new)."),
    },
    async ({ order_id, namespace, key, value, type }) => {
      const gid = order_id.startsWith("gid://") ? order_id : `gid://shopify/Order/${order_id}`;
      const metafield: Record<string, unknown> = { ownerId: gid, key, value };
      if (namespace) metafield.namespace = namespace;
      if (type) metafield.type = type;
      const query = `mutation ($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type jsonValue createdAt updatedAt }
          userErrors { field message }
        }
      }`;
      const data = await client.graphql<{
        metafieldsSet: { metafields: unknown[]; userErrors: { field: string[]; message: string }[] };
      }>(query, { metafields: [metafield] });
      if (data.metafieldsSet.userErrors.length > 0) {
        throw new Error(`metafieldsSet errors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.metafieldsSet.metafields, null, 2) }],
      };
    }
  );

  // ── Delete an order metafield ────────────────────────────────────
  server.tool(
    "delete_order_metafield",
    "Delete an order metafield by its GID or numeric ID.",
    {
      metafield_id: z.string().describe("The metafield GID or numeric ID."),
    },
    async ({ metafield_id }) => {
      const gid = metafield_id.startsWith("gid://") ? metafield_id : `gid://shopify/Metafield/${metafield_id}`;
      const query = `mutation ($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors { field message }
        }
      }`;
      const data = await client.graphql<{
        metafieldDelete: { deletedId: string; userErrors: { field: string[]; message: string }[] };
      }>(query, { input: { id: gid } });
      if (data.metafieldDelete.userErrors.length > 0) {
        throw new Error(`metafieldDelete errors: ${JSON.stringify(data.metafieldDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: `Metafield ${data.metafieldDelete.deletedId} deleted.` }],
      };
    }
  );
}
