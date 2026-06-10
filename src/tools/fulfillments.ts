import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, throwOnUserErrors } from "./graphql-helpers.js";

const FULFILLMENT_ORDER_FIELDS = `
  id
  status
  requestStatus
  assignedLocation { name location { id } }
  lineItems(first: 50) { nodes { id totalQuantity remainingQuantity lineItem { id name quantity } } }
`;

const FULFILLMENT_FIELDS = `
  id
  status
  createdAt
  updatedAt
  trackingInfo { number url company }
  fulfillmentLineItems(first: 50) { nodes { id quantity lineItem { id name } } }
`;

function trackingInfo(tracking_number?: string, tracking_url?: string, tracking_company?: string) {
  return compact({ number: tracking_number, url: tracking_url, company: tracking_company });
}

export function registerFulfillmentTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_fulfillment_orders",
    "List fulfillment orders for an order. Fulfillment orders represent groups of items to be fulfilled from a specific location.",
    { order_id: z.string().describe("The numeric Shopify order ID.") },
    async ({ order_id }) => {
      const query = `query ListFulfillmentOrders($orderId: ID!) { order(id: $orderId) { fulfillmentOrders(first: 50) { nodes { ${FULFILLMENT_ORDER_FIELDS} } } } }`;
      const data = await client.graphql<{ order: { fulfillmentOrders: { nodes: unknown[] } } }>(query, { orderId: gid("Order", order_id) });
      return { content: [{ type: "text", text: JSON.stringify(data.order.fulfillmentOrders.nodes, null, 2) }] };
    }
  );

  server.tool(
    "list_fulfillments",
    "List all fulfillments for an order, including tracking info and status.",
    { order_id: z.string().describe("The numeric Shopify order ID."), limit: z.number().min(1).max(250).default(50).describe("Number of fulfillments to return. Default: 50."), page_info: z.string().optional().describe("Cursor for pagination.") },
    async ({ order_id }) => {
      const query = `query ListFulfillments($orderId: ID!) { order(id: $orderId) { fulfillments { ${FULFILLMENT_FIELDS} } } }`;
      const data = await client.graphql<{ order: { fulfillments: unknown[] } }>(query, { orderId: gid("Order", order_id) });
      return { content: [{ type: "text", text: JSON.stringify(data.order.fulfillments, null, 2) }] };
    }
  );

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
      const mutation = `mutation FulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) { fulfillmentCreate(fulfillment: $fulfillment, message: $message) { fulfillment { ${FULFILLMENT_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ fulfillmentCreate: { fulfillment: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        fulfillment: compact({
          notifyCustomer: notify_customer,
          trackingInfo: trackingInfo(tracking_number, tracking_url, tracking_company),
          lineItemsByFulfillmentOrder: fulfillment_order_ids.map((id) => ({ fulfillmentOrderId: gid("FulfillmentOrder", id) })),
        }),
      });
      throwOnUserErrors("fulfillmentCreate", data.fulfillmentCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.fulfillmentCreate.fulfillment, null, 2) }] };
    }
  );

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
      const mutation = `mutation FulfillmentTrackingInfoUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) { fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) { fulfillment { ${FULFILLMENT_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ fulfillmentTrackingInfoUpdate: { fulfillment: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        fulfillmentId: gid("Fulfillment", fulfillment_id),
        trackingInfoInput: trackingInfo(tracking_number, tracking_url, tracking_company),
        notifyCustomer: notify_customer,
      });
      throwOnUserErrors("fulfillmentTrackingInfoUpdate", data.fulfillmentTrackingInfoUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.fulfillmentTrackingInfoUpdate.fulfillment, null, 2) }] };
    }
  );

  server.tool(
    "cancel_fulfillment",
    "Cancel a fulfillment. This restocks the items and sets the fulfillment status to cancelled.",
    { fulfillment_id: z.string().describe("The numeric fulfillment ID to cancel.") },
    async ({ fulfillment_id }) => {
      const mutation = `mutation FulfillmentCancel($id: ID!) { fulfillmentCancel(id: $id) { fulfillment { id status } userErrors { field message } } }`;
      const data = await client.graphql<{ fulfillmentCancel: { fulfillment: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("Fulfillment", fulfillment_id) });
      throwOnUserErrors("fulfillmentCancel", data.fulfillmentCancel.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.fulfillmentCancel.fulfillment, null, 2) }] };
    }
  );
}