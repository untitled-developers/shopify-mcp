import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, throwOnUserErrors } from "./graphql-helpers.js";

const WEBHOOK_FIELDS = `id topic format uri createdAt updatedAt`;

function topicEnum(topic?: string) {
  return topic ? topic.replace(/[/-]/g, "_").toUpperCase() : undefined;
}

function formatEnum(format?: "json" | "xml") {
  return format ? format.toUpperCase() : undefined;
}

export function registerWebhookTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_webhooks",
    "List all webhook subscriptions for this app.",
    {
      limit: z.number().min(1).max(250).default(50).describe("Number of webhooks to return. Default: 50."),
      topic: z.string().optional().describe("Filter by topic (e.g. 'orders/create', 'products/update')."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, topic, page_info }) => {
      const query = `
        query ListWebhooks($first: Int!, $after: String, $topics: [WebhookSubscriptionTopic!]) {
          webhookSubscriptions(first: $first, after: $after, topics: $topics) {
            nodes { ${WEBHOOK_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await client.graphql<{ webhookSubscriptions: { nodes: unknown[]; pageInfo: unknown } }>(query, {
        first: limit,
        after: page_info ?? null,
        topics: topic ? [topicEnum(topic)] : null,
      });
      return { content: [{ type: "text", text: JSON.stringify({ webhooks: data.webhookSubscriptions.nodes, pageInfo: data.webhookSubscriptions.pageInfo }, null, 2) }] };
    }
  );

  server.tool("get_webhook", "Get details of a single webhook subscription.", { webhook_id: z.string().describe("The numeric webhook ID.") }, async ({ webhook_id }) => {
    const query = `query GetWebhook($id: ID!) { webhookSubscription(id: $id) { ${WEBHOOK_FIELDS} } }`;
    const data = await client.graphql<{ webhookSubscription: unknown }>(query, { id: gid("WebhookSubscription", webhook_id) });
    return { content: [{ type: "text", text: JSON.stringify(data.webhookSubscription, null, 2) }] };
  });

  server.tool(
    "create_webhook",
    "Create a new webhook subscription. Common topics: orders/create, orders/updated, products/create, products/update, customers/create, app/uninstalled.",
    { topic: z.string().describe("Webhook topic (e.g. 'orders/create', 'products/update')."), address: z.string().describe("The URL where the webhook will POST data to."), format: z.enum(["json", "xml"]).default("json").describe("Data format. Default: json.") },
    async ({ topic, address, format }) => {
      const mutation = `mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) { webhookSubscription { ${WEBHOOK_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ webhookSubscriptionCreate: { webhookSubscription: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        topic: topicEnum(topic),
        webhookSubscription: compact({ uri: address, format: formatEnum(format) }),
      });
      throwOnUserErrors("webhookSubscriptionCreate", data.webhookSubscriptionCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.webhookSubscriptionCreate.webhookSubscription, null, 2) }] };
    }
  );

  server.tool("update_webhook", "Update an existing webhook subscription's callback URL. The topic cannot be changed after creation; delete and recreate the webhook to change topics.", { webhook_id: z.string().describe("The numeric webhook ID."), address: z.string().optional().describe("New callback URL.") }, async ({ webhook_id, address }) => {
    const mutation = `mutation WebhookSubscriptionUpdate($id: ID!, $webhookSubscription: WebhookSubscriptionInput!) { webhookSubscriptionUpdate(id: $id, webhookSubscription: $webhookSubscription) { webhookSubscription { ${WEBHOOK_FIELDS} } userErrors { field message } } }`;
    const data = await client.graphql<{ webhookSubscriptionUpdate: { webhookSubscription: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
      id: gid("WebhookSubscription", webhook_id),
      webhookSubscription: compact({ uri: address }),
    });
    throwOnUserErrors("webhookSubscriptionUpdate", data.webhookSubscriptionUpdate.userErrors);
    return { content: [{ type: "text", text: JSON.stringify(data.webhookSubscriptionUpdate.webhookSubscription, null, 2) }] };
  });

  server.tool("delete_webhook", "Delete a webhook subscription.", { webhook_id: z.string().describe("The numeric webhook ID to delete.") }, async ({ webhook_id }) => {
    const mutation = `mutation WebhookSubscriptionDelete($id: ID!) { webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } } }`;
    const data = await client.graphql<{ webhookSubscriptionDelete: { deletedWebhookSubscriptionId: string | null; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("WebhookSubscription", webhook_id) });
    throwOnUserErrors("webhookSubscriptionDelete", data.webhookSubscriptionDelete.userErrors);
    return { content: [{ type: "text", text: `Webhook ${data.webhookSubscriptionDelete.deletedWebhookSubscriptionId ?? webhook_id} deleted successfully.` }] };
  });
}