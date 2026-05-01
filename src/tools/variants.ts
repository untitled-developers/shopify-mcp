import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, throwOnUserErrors } from "./graphql-helpers.js";

const VARIANT_FIELDS = `
  id
  title
  sku
  barcode
  price
  compareAtPrice
  inventoryQuantity
  taxable
  selectedOptions { name value }
  inventoryItem { id tracked measurement { weight { value unit } } }
`;

function weightUnit(unit?: "g" | "kg" | "lb" | "oz") {
  return unit ? unit.toUpperCase() : undefined;
}

function variantInput(fields: Record<string, unknown>) {
  const optionValues = [fields.option1, fields.option2, fields.option3]
    .map((value, index) => (typeof value === "string" && value ? { name: value, optionName: index === 0 ? "Title" : `Option ${index + 1}` } : undefined))
    .filter(Boolean);

  return compact({
    id: fields.variant_id,
    price: fields.price,
    compareAtPrice: fields.compare_at_price,
    barcode: fields.barcode,
    taxable: fields.taxable,
    inventoryItem: compact({
      sku: fields.sku,
      requiresShipping: fields.requires_shipping,
      measurement: fields.weight !== undefined ? { weight: { value: fields.weight, unit: weightUnit(fields.weight_unit as "g" | "kg" | "lb" | "oz" | undefined) } } : undefined,
    }),
    inventoryQuantities: fields.inventory_quantity !== undefined ? [{ availableQuantity: fields.inventory_quantity }] : undefined,
    optionValues: optionValues.length ? optionValues : undefined,
  });
}

export function registerVariantTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_variants",
    "List all variants of a product. Each variant represents a specific purchasable SKU with its own price, inventory, and options.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of variants to return (1-250). Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ product_id, limit, page_info }) => {
      const query = `
        query ListVariants($id: ID!, $first: Int!, $after: String) {
          product(id: $id) {
            variants(first: $first, after: $after) {
              nodes { ${VARIANT_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `;
      const data = await client.graphql<{ product: { variants: { nodes: unknown[]; pageInfo: unknown } } }>(query, {
        id: gid("Product", product_id),
        first: limit,
        after: page_info ?? null,
      });
      return { content: [{ type: "text", text: JSON.stringify({ variants: data.product.variants.nodes, pageInfo: data.product.variants.pageInfo }, null, 2) }] };
    }
  );

  server.tool(
    "get_variant",
    "Get full details of a single product variant by its ID.",
    { variant_id: z.string().describe("The numeric Shopify variant ID.") },
    async ({ variant_id }) => {
      const query = `query GetVariant($id: ID!) { productVariant(id: $id) { ${VARIANT_FIELDS} } }`;
      const data = await client.graphql<{ productVariant: unknown }>(query, { id: gid("ProductVariant", variant_id) });
      return { content: [{ type: "text", text: JSON.stringify(data.productVariant, null, 2) }] };
    }
  );

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
      const mutation = `
        mutation ProductVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) {
            productVariants { ${VARIANT_FIELDS} }
            userErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productVariantsBulkCreate: { productVariants: unknown[]; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: gid("Product", product_id),
        variants: [variantInput(fields)],
      });
      throwOnUserErrors("productVariantsBulkCreate", data.productVariantsBulkCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.productVariantsBulkCreate.productVariants[0] ?? null, null, 2) }] };
    }
  );

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
      const productQuery = `query GetVariantProduct($id: ID!) { productVariant(id: $id) { product { id } } }`;
      const variantData = await client.graphql<{ productVariant: { product: { id: string } } }>(productQuery, { id: gid("ProductVariant", variant_id) });
      const mutation = `
        mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { ${VARIANT_FIELDS} }
            userErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productVariantsBulkUpdate: { productVariants: unknown[]; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: variantData.productVariant.product.id,
        variants: [variantInput({ variant_id: gid("ProductVariant", variant_id), ...fields })],
      });
      throwOnUserErrors("productVariantsBulkUpdate", data.productVariantsBulkUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.productVariantsBulkUpdate.productVariants[0] ?? null, null, 2) }] };
    }
  );

  server.tool(
    "delete_variant",
    "Delete a product variant. A product must always have at least one variant.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      variant_id: z.string().describe("The numeric variant ID to delete."),
    },
    async ({ product_id, variant_id }) => {
      const mutation = `
        mutation ProductVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
          productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
            userErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productVariantsBulkDelete: { userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: gid("Product", product_id),
        variantsIds: [gid("ProductVariant", variant_id)],
      });
      throwOnUserErrors("productVariantsBulkDelete", data.productVariantsBulkDelete.userErrors);
      return { content: [{ type: "text", text: `Variant ${variant_id} deleted from product ${product_id}.` }] };
    }
  );
}