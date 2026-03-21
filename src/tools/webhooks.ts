import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerWebhookTools(server: McpServer, client: ShopifyClient) {
  // ── List webhooks ─────────────────────────────────────────────────
  server.tool(
    "list_webhooks",
    "List all webhook subscriptions for this app.",
    {
      limit: z.number().min(1).max(250).default(50).describe("Number of webhooks to return. Default: 50."),
      topic: z.string().optional().describe("Filter by topic (e.g. 'orders/create', 'products/update')."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, topic, page_info }) => {
      const data = await client.request<{ webhooks: unknown[] }>("webhooks.json", {
        params: { limit, topic, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.webhooks, null, 2) }],
      };
    }
  );

  // ── Get a webhook ─────────────────────────────────────────────────
  server.tool(
    "get_webhook",
    "Get details of a single webhook subscription.",
    {
      webhook_id: z.string().describe("The numeric webhook ID."),
    },
    async ({ webhook_id }) => {
      const data = await client.request<{ webhook: unknown }>(`webhooks/${webhook_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.webhook, null, 2) }],
      };
    }
  );

  // ── Create a webhook ──────────────────────────────────────────────
  server.tool(
    "create_webhook",
    "Create a new webhook subscription. Common topics: orders/create, orders/updated, products/create, products/update, customers/create, app/uninstalled.",
    {
      topic: z.string().describe("Webhook topic (e.g. 'orders/create', 'products/update')."),
      address: z.string().describe("The URL where the webhook will POST data to."),
      format: z.enum(["json", "xml"]).default("json").describe("Data format. Default: json."),
    },
    async ({ topic, address, format }) => {
      const data = await client.request<{ webhook: unknown }>("webhooks.json", {
        method: "POST",
        body: { webhook: { topic, address, format } },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.webhook, null, 2) }],
      };
    }
  );

  // ── Update a webhook ──────────────────────────────────────────────
  server.tool(
    "update_webhook",
    "Update an existing webhook subscription (change the address or topic).",
    {
      webhook_id: z.string().describe("The numeric webhook ID."),
      address: z.string().optional().describe("New callback URL."),
      topic: z.string().optional().describe("New topic."),
    },
    async ({ webhook_id, ...fields }) => {
      const webhook: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) webhook[k] = v;
      }
      const data = await client.request<{ webhook: unknown }>(`webhooks/${webhook_id}.json`, {
        method: "PUT",
        body: { webhook },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.webhook, null, 2) }],
      };
    }
  );

  // ── Delete a webhook ──────────────────────────────────────────────
  server.tool(
    "delete_webhook",
    "Delete a webhook subscription.",
    {
      webhook_id: z.string().describe("The numeric webhook ID to delete."),
    },
    async ({ webhook_id }) => {
      await client.request(`webhooks/${webhook_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Webhook ${webhook_id} deleted successfully.` }],
      };
    }
  );
}
