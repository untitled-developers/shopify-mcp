import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerVariantTools(server: McpServer, client: ShopifyClient) {
  // ── List product variants ─────────────────────────────────────────
  server.tool(
    "list_variants",
    "List all variants of a product. Each variant represents a specific purchasable SKU with its own price, inventory, and options.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of variants to return (1–250). Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ product_id, limit, page_info }) => {
      const data = await client.request<{ variants: unknown[] }>(`products/${product_id}/variants.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.variants, null, 2) }],
      };
    }
  );

  // ── Get a single variant ──────────────────────────────────────────
  server.tool(
    "get_variant",
    "Get full details of a single product variant by its ID.",
    {
      variant_id: z.string().describe("The numeric Shopify variant ID."),
    },
    async ({ variant_id }) => {
      const data = await client.request<{ variant: unknown }>(`variants/${variant_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.variant, null, 2) }],
      };
    }
  );

  // ── Create a variant ──────────────────────────────────────────────
  server.tool(
    "create_variant",
    "Create a new variant for a product. Must specify at least one option value.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      option1: z.string().optional().describe("Value for the first product option (e.g. 'Small')."),
      option2: z.string().optional().describe("Value for the second product option (e.g. 'Red')."),
      option3: z.string().optional().describe("Value for the third product option."),
      price: z.string().optional().describe("Variant price (e.g. '29.99')."),
      compare_at_price: z.string().optional().describe("Compare-at price for showing a sale (e.g. '39.99')."),
      sku: z.string().optional().describe("SKU code."),
      barcode: z.string().optional().describe("Barcode (ISBN, UPC, GTIN, etc.)."),
      weight: z.number().optional().describe("Weight in the specified unit."),
      weight_unit: z.enum(["g", "kg", "lb", "oz"]).optional().describe("Weight unit."),
      inventory_quantity: z.number().optional().describe("Initial stock quantity."),
      requires_shipping: z.boolean().optional().describe("Whether the variant requires shipping."),
      taxable: z.boolean().optional().describe("Whether the variant is taxable."),
    },
    async ({ product_id, ...fields }) => {
      const variant: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) variant[k] = v;
      }
      const data = await client.request<{ variant: unknown }>(`products/${product_id}/variants.json`, {
        method: "POST",
        body: { variant },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.variant, null, 2) }],
      };
    }
  );

  // ── Update a variant ──────────────────────────────────────────────
  server.tool(
    "update_variant",
    "Update an existing product variant. Only provided fields are changed.",
    {
      variant_id: z.string().describe("The numeric Shopify variant ID."),
      price: z.string().optional().describe("New price."),
      compare_at_price: z.string().optional().describe("New compare-at price."),
      sku: z.string().optional().describe("New SKU code."),
      barcode: z.string().optional().describe("New barcode."),
      weight: z.number().optional().describe("New weight."),
      weight_unit: z.enum(["g", "kg", "lb", "oz"]).optional().describe("New weight unit."),
      option1: z.string().optional().describe("New value for option 1."),
      option2: z.string().optional().describe("New value for option 2."),
      option3: z.string().optional().describe("New value for option 3."),
      requires_shipping: z.boolean().optional().describe("Whether shipping is required."),
      taxable: z.boolean().optional().describe("Whether it is taxable."),
    },
    async ({ variant_id, ...fields }) => {
      const variant: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) variant[k] = v;
      }
      const data = await client.request<{ variant: unknown }>(`variants/${variant_id}.json`, {
        method: "PUT",
        body: { variant },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.variant, null, 2) }],
      };
    }
  );

  // ── Delete a variant ──────────────────────────────────────────────
  server.tool(
    "delete_variant",
    "Delete a product variant. A product must always have at least one variant.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      variant_id: z.string().describe("The numeric variant ID to delete."),
    },
    async ({ product_id, variant_id }) => {
      await client.request(`products/${product_id}/variants/${variant_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Variant ${variant_id} deleted from product ${product_id}.` }],
      };
    }
  );
}
