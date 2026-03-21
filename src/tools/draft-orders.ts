import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerDraftOrderTools(server: McpServer, client: ShopifyClient) {
  // ── List draft orders ─────────────────────────────────────────────
  server.tool(
    "list_draft_orders",
    "List draft orders in the store. Draft orders can be used to create orders on behalf of customers.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of draft orders to return (1–250). Default: 10."),
      status: z.enum(["open", "invoice_sent", "completed"]).optional().describe("Filter by draft order status."),
      since_id: z.string().optional().describe("Return draft orders after this ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, status, since_id, page_info }) => {
      const data = await client.request<{ draft_orders: unknown[] }>("draft_orders.json", {
        params: { limit, status, since_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_orders, null, 2) }],
      };
    }
  );

  // ── Get a single draft order ──────────────────────────────────────
  server.tool(
    "get_draft_order",
    "Get full details of a single draft order by its ID.",
    {
      draft_order_id: z.string().describe("The numeric Shopify draft order ID."),
    },
    async ({ draft_order_id }) => {
      const data = await client.request<{ draft_order: unknown }>(`draft_orders/${draft_order_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_order, null, 2) }],
      };
    }
  );

  // ── Create a draft order ──────────────────────────────────────────
  server.tool(
    "create_draft_order",
    "Create a new draft order. Provide line items (variant-based or custom), an optional customer, and shipping/billing addresses.",
    {
      line_items: z.array(z.object({
        variant_id: z.string().optional().describe("Existing variant ID."),
        title: z.string().optional().describe("Custom line item title (if no variant_id)."),
        price: z.string().optional().describe("Custom line item price (required if no variant_id)."),
        quantity: z.number().min(1).default(1).describe("Quantity."),
      })).describe("Line items for the draft order."),
      customer_id: z.string().optional().describe("Associate with an existing customer ID."),
      email: z.string().optional().describe("Customer email for the draft order."),
      note: z.string().optional().describe("Note for the draft order."),
      tags: z.string().optional().describe("Comma-separated tags."),
      shipping_address: z.object({
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        address1: z.string().optional(),
        city: z.string().optional(),
        province: z.string().optional(),
        country: z.string().optional(),
        zip: z.string().optional(),
        phone: z.string().optional(),
      }).optional().describe("Shipping address."),
      use_customer_default_address: z.boolean().optional().describe("Use the customer's default address."),
      tax_exempt: z.boolean().optional().describe("Whether the draft order is tax-exempt."),
    },
    async ({ line_items, customer_id, email, note, tags, shipping_address, use_customer_default_address, tax_exempt }) => {
      const draft_order: Record<string, unknown> = { line_items };
      if (customer_id) draft_order.customer = { id: customer_id };
      if (email) draft_order.email = email;
      if (note) draft_order.note = note;
      if (tags) draft_order.tags = tags;
      if (shipping_address) draft_order.shipping_address = shipping_address;
      if (use_customer_default_address !== undefined) draft_order.use_customer_default_address = use_customer_default_address;
      if (tax_exempt !== undefined) draft_order.tax_exempt = tax_exempt;

      const data = await client.request<{ draft_order: unknown }>("draft_orders.json", {
        method: "POST",
        body: { draft_order },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_order, null, 2) }],
      };
    }
  );

  // ── Update a draft order ──────────────────────────────────────────
  server.tool(
    "update_draft_order",
    "Update an existing draft order. Only provided fields are changed.",
    {
      draft_order_id: z.string().describe("The numeric draft order ID."),
      note: z.string().optional().describe("Updated note."),
      tags: z.string().optional().describe("Updated tags (replaces all)."),
      email: z.string().optional().describe("Updated email."),
      tax_exempt: z.boolean().optional().describe("Whether tax-exempt."),
    },
    async ({ draft_order_id, ...fields }) => {
      const draft_order: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) draft_order[k] = v;
      }
      const data = await client.request<{ draft_order: unknown }>(`draft_orders/${draft_order_id}.json`, {
        method: "PUT",
        body: { draft_order },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_order, null, 2) }],
      };
    }
  );

  // ── Complete a draft order ────────────────────────────────────────
  server.tool(
    "complete_draft_order",
    "Complete a draft order, converting it into a real order. Optionally mark it as paid.",
    {
      draft_order_id: z.string().describe("The numeric draft order ID."),
      payment_pending: z.boolean().default(false).describe("If true, the order is created with payment pending. Default: false (marked as paid)."),
    },
    async ({ draft_order_id, payment_pending }) => {
      const data = await client.request<{ draft_order: unknown }>(`draft_orders/${draft_order_id}/complete.json`, {
        method: "PUT",
        params: { payment_pending },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_order, null, 2) }],
      };
    }
  );

  // ── Send draft order invoice ──────────────────────────────────────
  server.tool(
    "send_draft_order_invoice",
    "Send an invoice email for a draft order with a secure checkout link.",
    {
      draft_order_id: z.string().describe("The numeric draft order ID."),
      to: z.string().optional().describe("Email to send the invoice to (defaults to the draft order's email)."),
      from: z.string().optional().describe("Sender email (defaults to shop email)."),
      subject: z.string().optional().describe("Custom email subject line."),
      custom_message: z.string().optional().describe("Custom message to include in the invoice email."),
    },
    async ({ draft_order_id, to, from, subject, custom_message }) => {
      const invoice: Record<string, unknown> = {};
      if (to) invoice.to = to;
      if (from) invoice.from = from;
      if (subject) invoice.subject = subject;
      if (custom_message) invoice.custom_message = custom_message;
      const data = await client.request<{ draft_order_invoice: unknown }>(
        `draft_orders/${draft_order_id}/send_invoice.json`,
        { method: "POST", body: { draft_order_invoice: invoice } }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.draft_order_invoice, null, 2) }],
      };
    }
  );

  // ── Delete a draft order ──────────────────────────────────────────
  server.tool(
    "delete_draft_order",
    "Permanently delete a draft order. Cannot delete completed draft orders.",
    {
      draft_order_id: z.string().describe("The numeric draft order ID to delete."),
    },
    async ({ draft_order_id }) => {
      await client.request(`draft_orders/${draft_order_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Draft order ${draft_order_id} deleted successfully.` }],
      };
    }
  );
}
