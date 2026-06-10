import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, searchQuery, throwOnUserErrors } from "./graphql-helpers.js";

const DRAFT_ORDER_FIELDS = `
  id
  name
  email
  status
  invoiceUrl
  note2
  tags
  totalPriceSet { shopMoney { amount currencyCode } }
  createdAt
  updatedAt
  lineItems(first: 50) { nodes { id title quantity originalUnitPriceSet { shopMoney { amount currencyCode } } variant { id } } }
`;

function draftLineItems(lineItems: { variant_id?: string; title?: string; price?: string; quantity: number }[]) {
  return lineItems.map((item) => compact({
    variantId: item.variant_id ? gid("ProductVariant", item.variant_id) : undefined,
    title: item.title,
    originalUnitPrice: item.price,
    quantity: item.quantity,
  }));
}

function draftOrderInput(fields: Record<string, unknown>) {
  return compact({
    lineItems: Array.isArray(fields.line_items) ? draftLineItems(fields.line_items as { variant_id?: string; title?: string; price?: string; quantity: number }[]) : undefined,
    customerId: typeof fields.customer_id === "string" ? gid("Customer", fields.customer_id) : undefined,
    email: fields.email,
    note: fields.note,
    tags: typeof fields.tags === "string" ? fields.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    shippingAddress: fields.shipping_address,
    useCustomerDefaultAddress: fields.use_customer_default_address,
    taxExempt: fields.tax_exempt,
  });
}

export function registerDraftOrderTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_draft_orders",
    "List draft orders in the store. Draft orders can be used to create orders on behalf of customers.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of draft orders to return (1-250). Default: 10."),
      status: z.enum(["open", "invoice_sent", "completed"]).optional().describe("Filter by draft order status."),
      since_id: z.string().optional().describe("Return draft orders after this ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, status, since_id, page_info }) => {
      const query = `
        query ListDraftOrders($first: Int!, $after: String, $query: String) {
          draftOrders(first: $first, after: $after, query: $query) {
            nodes { ${DRAFT_ORDER_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await client.graphql<{ draftOrders: { nodes: unknown[]; pageInfo: unknown } }>(query, {
        first: limit,
        after: page_info ?? null,
        query: searchQuery({ status, id: since_id ? `>${since_id}` : undefined }) ?? null,
      });
      return { content: [{ type: "text", text: JSON.stringify({ draft_orders: data.draftOrders.nodes, pageInfo: data.draftOrders.pageInfo }, null, 2) }] };
    }
  );

  server.tool("get_draft_order", "Get full details of a single draft order by its ID.", { draft_order_id: z.string().describe("The numeric Shopify draft order ID.") }, async ({ draft_order_id }) => {
    const query = `query GetDraftOrder($id: ID!) { draftOrder(id: $id) { ${DRAFT_ORDER_FIELDS} } }`;
    const data = await client.graphql<{ draftOrder: unknown }>(query, { id: gid("DraftOrder", draft_order_id) });
    return { content: [{ type: "text", text: JSON.stringify(data.draftOrder, null, 2) }] };
  });

  server.tool(
    "create_draft_order",
    "Create a new draft order. Provide line items (variant-based or custom), an optional customer, and shipping/billing addresses.",
    {
      line_items: z.array(z.object({ variant_id: z.string().optional(), title: z.string().optional(), price: z.string().optional(), quantity: z.number().min(1).default(1) })).describe("Line items for the draft order."),
      customer_id: z.string().optional().describe("Associate with an existing customer ID."),
      email: z.string().optional().describe("Customer email for the draft order."),
      note: z.string().optional().describe("Note for the draft order."),
      tags: z.string().optional().describe("Comma-separated tags."),
      shipping_address: z.object({ first_name: z.string().optional(), last_name: z.string().optional(), address1: z.string().optional(), city: z.string().optional(), province: z.string().optional(), country: z.string().optional(), zip: z.string().optional(), phone: z.string().optional() }).optional().describe("Shipping address."),
      use_customer_default_address: z.boolean().optional().describe("Use the customer's default address."),
      tax_exempt: z.boolean().optional().describe("Whether the draft order is tax-exempt."),
    },
    async (args) => {
      const mutation = `mutation DraftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { ${DRAFT_ORDER_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ draftOrderCreate: { draftOrder: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: draftOrderInput(args) });
      throwOnUserErrors("draftOrderCreate", data.draftOrderCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.draftOrderCreate.draftOrder, null, 2) }] };
    }
  );

  server.tool(
    "update_draft_order",
    "Update an existing draft order. Only provided fields are changed.",
    { draft_order_id: z.string().describe("The numeric draft order ID."), note: z.string().optional().describe("Updated note."), tags: z.string().optional().describe("Updated tags (replaces all)."), email: z.string().optional().describe("Updated email."), tax_exempt: z.boolean().optional().describe("Whether tax-exempt.") },
    async ({ draft_order_id, ...fields }) => {
      const mutation = `mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { ${DRAFT_ORDER_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ draftOrderUpdate: { draftOrder: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("DraftOrder", draft_order_id), input: draftOrderInput(fields) });
      throwOnUserErrors("draftOrderUpdate", data.draftOrderUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.draftOrderUpdate.draftOrder, null, 2) }] };
    }
  );

  server.tool("complete_draft_order", "Complete a draft order, converting it into a real order. Optionally mark it as paid.", { draft_order_id: z.string().describe("The numeric draft order ID."), payment_pending: z.boolean().default(false).describe("If true, the order is created with payment pending. Default: false (marked as paid).") }, async ({ draft_order_id, payment_pending }) => {
    const mutation = `mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean) { draftOrderComplete(id: $id, paymentPending: $paymentPending) { draftOrder { id name status order { id name } } userErrors { field message } } }`;
    const data = await client.graphql<{ draftOrderComplete: { draftOrder: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("DraftOrder", draft_order_id), paymentPending: payment_pending });
    throwOnUserErrors("draftOrderComplete", data.draftOrderComplete.userErrors);
    return { content: [{ type: "text", text: JSON.stringify(data.draftOrderComplete.draftOrder, null, 2) }] };
  });

  server.tool("send_draft_order_invoice", "Send an invoice email for a draft order with a secure checkout link.", { draft_order_id: z.string().describe("The numeric draft order ID."), to: z.string().optional().describe("Email to send the invoice to (defaults to the draft order's email)."), from: z.string().optional().describe("Sender email (defaults to shop email)."), subject: z.string().optional().describe("Custom email subject line."), custom_message: z.string().optional().describe("Custom message to include in the invoice email.") }, async ({ draft_order_id, to, from, subject, custom_message }) => {
    const mutation = `mutation DraftOrderInvoiceSend($id: ID!, $email: EmailInput) { draftOrderInvoiceSend(id: $id, email: $email) { draftOrder { id name invoiceSentAt } userErrors { field message } } }`;
    const data = await client.graphql<{ draftOrderInvoiceSend: { draftOrder: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("DraftOrder", draft_order_id), email: compact({ to, from, subject, customMessage: custom_message }) });
    throwOnUserErrors("draftOrderInvoiceSend", data.draftOrderInvoiceSend.userErrors);
    return { content: [{ type: "text", text: JSON.stringify(data.draftOrderInvoiceSend.draftOrder, null, 2) }] };
  });

  server.tool("delete_draft_order", "Permanently delete a draft order. Cannot delete completed draft orders.", { draft_order_id: z.string().describe("The numeric draft order ID to delete.") }, async ({ draft_order_id }) => {
    const mutation = `mutation DraftOrderDelete($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { field message } } }`;
    const data = await client.graphql<{ draftOrderDelete: { deletedId: string | null; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: { id: gid("DraftOrder", draft_order_id) } });
    throwOnUserErrors("draftOrderDelete", data.draftOrderDelete.userErrors);
    return { content: [{ type: "text", text: `Draft order ${data.draftOrderDelete.deletedId ?? draft_order_id} deleted successfully.` }] };
  });
}