import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerDiscountTools(server: McpServer, client: ShopifyClient) {
  // ── List price rules ──────────────────────────────────────────────
  server.tool(
    "list_price_rules",
    "List all price rules in the store. Price rules are the foundation for discount codes.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of price rules to return (1–250). Default: 10."),
      since_id: z.string().optional().describe("Return price rules after this ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, page_info }) => {
      const data = await client.request<{ price_rules: unknown[] }>("price_rules.json", {
        params: { limit, since_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rules, null, 2) }],
      };
    }
  );

  // ── Get a price rule ──────────────────────────────────────────────
  server.tool(
    "get_price_rule",
    "Get full details of a single price rule by its ID.",
    {
      price_rule_id: z.string().describe("The numeric Shopify price rule ID."),
    },
    async ({ price_rule_id }) => {
      const data = await client.request<{ price_rule: unknown }>(`price_rules/${price_rule_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Create a price rule ───────────────────────────────────────────
  server.tool(
    "create_price_rule",
    "Create a new price rule for discount codes. Supports percentage, fixed amount, or free shipping discounts.",
    {
      title: z.string().describe("Price rule title (internal name)."),
      target_type: z.enum(["line_item", "shipping_line"]).describe("What the discount applies to."),
      target_selection: z.enum(["all", "entitled"]).describe("Which items the discount targets."),
      allocation_method: z.enum(["across", "each"]).describe("How the discount is allocated: 'across' splits evenly, 'each' applies to each item."),
      value_type: z.enum(["percentage", "fixed_amount"]).describe("Type of discount value."),
      value: z.string().describe("Discount value (negative number, e.g. '-10.0' for 10% or $10 off)."),
      customer_selection: z.enum(["all", "prerequisite"]).default("all").describe("Which customers qualify. Default: all."),
      starts_at: z.string().describe("When the discount becomes active (ISO 8601)."),
      ends_at: z.string().optional().describe("When the discount expires (ISO 8601)."),
      usage_limit: z.number().optional().describe("Maximum total number of times the discount can be used."),
      once_per_customer: z.boolean().default(false).describe("Limit to one use per customer. Default: false."),
    },
    async ({ title, target_type, target_selection, allocation_method, value_type, value, customer_selection, starts_at, ends_at, usage_limit, once_per_customer }) => {
      const price_rule: Record<string, unknown> = {
        title, target_type, target_selection, allocation_method, value_type, value, customer_selection, starts_at, once_per_customer,
      };
      if (ends_at) price_rule.ends_at = ends_at;
      if (usage_limit !== undefined) price_rule.usage_limit = usage_limit;
      const data = await client.request<{ price_rule: unknown }>("price_rules.json", {
        method: "POST",
        body: { price_rule },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Update a price rule ───────────────────────────────────────────
  server.tool(
    "update_price_rule",
    "Update an existing price rule. Only provided fields are changed.",
    {
      price_rule_id: z.string().describe("The numeric price rule ID."),
      title: z.string().optional().describe("New title."),
      value: z.string().optional().describe("New discount value."),
      starts_at: z.string().optional().describe("New start date."),
      ends_at: z.string().optional().describe("New end date."),
      usage_limit: z.number().optional().describe("New usage limit."),
      once_per_customer: z.boolean().optional().describe("Limit one per customer."),
    },
    async ({ price_rule_id, ...fields }) => {
      const price_rule: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) price_rule[k] = v;
      }
      const data = await client.request<{ price_rule: unknown }>(`price_rules/${price_rule_id}.json`, {
        method: "PUT",
        body: { price_rule },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Delete a price rule ───────────────────────────────────────────
  server.tool(
    "delete_price_rule",
    "Permanently delete a price rule and all its associated discount codes.",
    {
      price_rule_id: z.string().describe("The numeric price rule ID to delete."),
    },
    async ({ price_rule_id }) => {
      await client.request(`price_rules/${price_rule_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Price rule ${price_rule_id} deleted successfully.` }],
      };
    }
  );

  // ── List discount codes for a price rule ──────────────────────────
  server.tool(
    "list_discount_codes",
    "List all discount codes for a specific price rule.",
    {
      price_rule_id: z.string().describe("The price rule ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of codes to return. Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ price_rule_id, limit, page_info }) => {
      const data = await client.request<{ discount_codes: unknown[] }>(`price_rules/${price_rule_id}/discount_codes.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.discount_codes, null, 2) }],
      };
    }
  );

  // ── Create a discount code ────────────────────────────────────────
  server.tool(
    "create_discount_code",
    "Create a new discount code for a price rule.",
    {
      price_rule_id: z.string().describe("The price rule ID this code belongs to."),
      code: z.string().describe("The discount code string that customers enter at checkout (e.g. 'SAVE10')."),
    },
    async ({ price_rule_id, code }) => {
      const data = await client.request<{ discount_code: unknown }>(`price_rules/${price_rule_id}/discount_codes.json`, {
        method: "POST",
        body: { discount_code: { code } },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.discount_code, null, 2) }],
      };
    }
  );

  // ── Delete a discount code ────────────────────────────────────────
  server.tool(
    "delete_discount_code",
    "Delete a discount code.",
    {
      price_rule_id: z.string().describe("The price rule ID."),
      discount_code_id: z.string().describe("The discount code ID to delete."),
    },
    async ({ price_rule_id, discount_code_id }) => {
      await client.request(`price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Discount code ${discount_code_id} deleted successfully.` }],
      };
    }
  );
}
