import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerFulfillmentTools(server: McpServer, client: ShopifyClient) {
  // ── List fulfillment orders ───────────────────────────────────────
  server.tool(
    "list_fulfillment_orders",
    "List fulfillment orders for an order. Fulfillment orders represent groups of items to be fulfilled from a specific location.",
    {
      order_id: z.string().describe("The numeric Shopify order ID."),
    },
    async ({ order_id }) => {
      const data = await client.request<{ fulfillment_orders: unknown[] }>(`orders/${order_id}/fulfillment_orders.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.fulfillment_orders, null, 2) }],
      };
    }
  );

  // ── List fulfillments for an order ────────────────────────────────
  server.tool(
    "list_fulfillments",
    "List all fulfillments for an order, including tracking info and status.",
    {
      order_id: z.string().describe("The numeric Shopify order ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of fulfillments to return. Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ order_id, limit, page_info }) => {
      const data = await client.request<{ fulfillments: unknown[] }>(`orders/${order_id}/fulfillments.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.fulfillments, null, 2) }],
      };
    }
  );

  // ── Create a fulfillment ──────────────────────────────────────────
  server.tool(
    "create_fulfillment",
    "Create a fulfillment for one or more fulfillment orders. This marks items as shipped and optionally adds tracking info.",
    {
      fulfillment_order_ids: z.array(z.string()).describe("Array of fulfillment order IDs to fulfill."),
      tracking_number: z.string().optional().describe("Tracking number."),
      tracking_url: z.string().optional().describe("Tracking URL."),
      tracking_company: z.string().optional().describe("Shipping carrier (e.g. 'UPS', 'FedEx', 'USPS')."),
      notify_customer: z.boolean().default(true).describe("Whether to notify the customer. Default: true."),
    },
    async ({ fulfillment_order_ids, tracking_number, tracking_url, tracking_company, notify_customer }) => {
      const line_items_by_fulfillment_order = fulfillment_order_ids.map((id) => ({
        fulfillment_order_id: id,
      }));
      const fulfillment: Record<string, unknown> = {
        line_items_by_fulfillment_order,
        notify_customer,
      };
      if (tracking_number || tracking_url || tracking_company) {
        fulfillment.tracking_info = {};
        if (tracking_number) (fulfillment.tracking_info as Record<string, unknown>).number = tracking_number;
        if (tracking_url) (fulfillment.tracking_info as Record<string, unknown>).url = tracking_url;
        if (tracking_company) (fulfillment.tracking_info as Record<string, unknown>).company = tracking_company;
      }
      const data = await client.request<{ fulfillment: unknown }>("fulfillments.json", {
        method: "POST",
        body: { fulfillment },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.fulfillment, null, 2) }],
      };
    }
  );

  // ── Update tracking for a fulfillment ─────────────────────────────
  server.tool(
    "update_fulfillment_tracking",
    "Update tracking information for an existing fulfillment.",
    {
      fulfillment_id: z.string().describe("The numeric fulfillment ID."),
      tracking_number: z.string().optional().describe("New tracking number."),
      tracking_url: z.string().optional().describe("New tracking URL."),
      tracking_company: z.string().optional().describe("New shipping carrier."),
      notify_customer: z.boolean().default(false).describe("Whether to send an updated notification. Default: false."),
    },
    async ({ fulfillment_id, tracking_number, tracking_url, tracking_company, notify_customer }) => {
      const fulfillment: Record<string, unknown> = { notify_customer };
      const tracking_info: Record<string, unknown> = {};
      if (tracking_number) tracking_info.number = tracking_number;
      if (tracking_url) tracking_info.url = tracking_url;
      if (tracking_company) tracking_info.company = tracking_company;
      fulfillment.tracking_info = tracking_info;
      const data = await client.request<{ fulfillment: unknown }>(`fulfillments/${fulfillment_id}/update_tracking.json`, {
        method: "POST",
        body: { fulfillment },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.fulfillment, null, 2) }],
      };
    }
  );

  // ── Cancel a fulfillment ──────────────────────────────────────────
  server.tool(
    "cancel_fulfillment",
    "Cancel a fulfillment. This restocks the items and sets the fulfillment status to cancelled.",
    {
      fulfillment_id: z.string().describe("The numeric fulfillment ID to cancel."),
    },
    async ({ fulfillment_id }) => {
      const data = await client.request<{ fulfillment: unknown }>(`fulfillments/${fulfillment_id}/cancel.json`, {
        method: "POST",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.fulfillment, null, 2) }],
      };
    }
  );
}
