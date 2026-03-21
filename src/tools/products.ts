import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerProductTools(server: McpServer, client: ShopifyClient) {
  // ── List products ─────────────────────────────────────────────────
  server.tool(
    "list_products",
    "List products in the store. Returns up to `limit` products, with optional filtering by status, title, vendor, product_type, or collection_id. Use `page_info` for cursor-based pagination.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of products to return (1–250). Default: 10."),
      status: z.enum(["active", "draft", "archived"]).optional().describe("Filter by product status."),
      title: z.string().optional().describe("Filter by exact title match."),
      vendor: z.string().optional().describe("Filter by vendor name."),
      product_type: z.string().optional().describe("Filter by product type."),
      collection_id: z.string().optional().describe("Filter by collection ID."),
      page_info: z.string().optional().describe("Cursor for next/previous page from a prior response's Link header."),
    },
    async ({ limit, status, title, vendor, product_type, collection_id, page_info }) => {
      const data = await client.request<{ products: unknown[] }>("products.json", {
        params: { limit, status, title, vendor, product_type, collection_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.products, null, 2) }],
      };
    }
  );

  // ── Get a single product ──────────────────────────────────────────
  server.tool(
    "get_product",
    "Get full details of a single product by its ID, including all variants, images, and options.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
    },
    async ({ product_id }) => {
      const data = await client.request<{ product: unknown }>(`products/${product_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.product, null, 2) }],
      };
    }
  );

  // ── Create a product ──────────────────────────────────────────────
  server.tool(
    "create_product",
    "Create a new product. At minimum provide a title. The product is created in 'draft' status by default. Variants can be provided to set prices, SKUs, and inventory.",
    {
      title: z.string().describe("Product title (required)."),
      body_html: z.string().optional().describe("Product description in HTML."),
      vendor: z.string().optional().describe("Product vendor/brand."),
      product_type: z.string().optional().describe("Product type/category."),
      tags: z.string().optional().describe("Comma-separated tags."),
      status: z.enum(["active", "draft", "archived"]).default("draft").describe("Product status. Default: draft."),
      variants: z
        .array(
          z.object({
            title: z.string().optional().describe("Variant title (e.g. 'Small', 'Blue')."),
            price: z.string().optional().describe("Variant price (e.g. '29.99')."),
            sku: z.string().optional().describe("SKU code."),
            inventory_quantity: z.number().optional().describe("Initial stock quantity."),
            weight: z.number().optional().describe("Weight in the store's default unit."),
            weight_unit: z.enum(["g", "kg", "lb", "oz"]).optional().describe("Weight unit."),
          })
        )
        .optional()
        .describe("Product variants with pricing and inventory."),
      images: z
        .array(z.object({ src: z.string().describe("Image URL.") }))
        .optional()
        .describe("Product images by URL."),
    },
    async ({ title, body_html, vendor, product_type, tags, status, variants, images }) => {
      const product: Record<string, unknown> = { title, status };
      if (body_html) product.body_html = body_html;
      if (vendor) product.vendor = vendor;
      if (product_type) product.product_type = product_type;
      if (tags) product.tags = tags;
      if (variants) product.variants = variants;
      if (images) product.images = images;

      const data = await client.request<{ product: unknown }>("products.json", {
        method: "POST",
        body: { product },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.product, null, 2) }],
      };
    }
  );

  // ── Update a product ──────────────────────────────────────────────
  server.tool(
    "update_product",
    "Update an existing product. Only provided fields are changed; omitted fields remain unchanged.",
    {
      product_id: z.string().describe("The numeric Shopify product ID to update."),
      title: z.string().optional().describe("New title."),
      body_html: z.string().optional().describe("New HTML description."),
      vendor: z.string().optional().describe("New vendor."),
      product_type: z.string().optional().describe("New product type."),
      tags: z.string().optional().describe("New comma-separated tags (replaces all existing tags)."),
      status: z.enum(["active", "draft", "archived"]).optional().describe("New status."),
    },
    async ({ product_id, ...fields }) => {
      const product: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) product[k] = v;
      }
      const data = await client.request<{ product: unknown }>(`products/${product_id}.json`, {
        method: "PUT",
        body: { product },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.product, null, 2) }],
      };
    }
  );

  // ── Delete a product ──────────────────────────────────────────────
  server.tool(
    "delete_product",
    "Permanently delete a product by its ID. This cannot be undone.",
    {
      product_id: z.string().describe("The numeric Shopify product ID to delete."),
    },
    async ({ product_id }) => {
      await client.request(`products/${product_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Product ${product_id} deleted successfully.` }],
      };
    }
  );

  // ── List product metafields ────────────────────────────────────────
  server.tool(
    "list_product_metafields",
    "List all metafields attached to a product via GraphQL. Returns key, namespace, type, jsonValue, and more. Optionally filter by namespace.",
    {
      product_id: z.string().describe("The numeric Shopify product ID (or GID like 'gid://shopify/Product/123')."),
      namespace: z.string().optional().describe("Filter by metafield namespace (e.g. 'custom')."),
      limit: z.number().min(1).max(100).default(50).describe("Number of metafields to return (1–100). Default: 50."),
    },
    async ({ product_id, namespace, limit }) => {
      const gid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;
      const query = `query ($id: ID!, $namespace: String, $first: Int!) {
        product(id: $id) {
          metafields(namespace: $namespace, first: $first) {
            edges {
              node {
                id
                namespace
                key
                type
                jsonValue
                description
                createdAt
                updatedAt
              }
            }
          }
        }
      }`;
      const data = await client.graphql<{
        product: { metafields: { edges: { node: unknown }[] } };
      }>(query, { id: gid, namespace: namespace ?? null, first: limit });
      const metafields = data.product.metafields.edges.map((e) => e.node);
      return {
        content: [{ type: "text", text: JSON.stringify(metafields, null, 2) }],
      };
    }
  );

  // ── Get a single product metafield ────────────────────────────────
  server.tool(
    "get_product_metafield",
    "Get a single metafield by namespace and key for a given product via GraphQL. Uses jsonValue for proper serialization.",
    {
      product_id: z.string().describe("The numeric Shopify product ID (or GID like 'gid://shopify/Product/123')."),
      namespace: z.string().describe("The metafield namespace (e.g. 'custom')."),
      key: z.string().describe("The metafield key (e.g. 'skin_concerns')."),
    },
    async ({ product_id, namespace, key }) => {
      const gid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;
      const query = `query ($id: ID!, $namespace: String!, $key: String!) {
        product(id: $id) {
          metafield(namespace: $namespace, key: $key) {
            id
            namespace
            key
            type
            jsonValue
            description
            createdAt
            updatedAt
          }
        }
      }`;
      const data = await client.graphql<{
        product: { metafield: unknown };
      }>(query, { id: gid, namespace, key });
      return {
        content: [{ type: "text", text: JSON.stringify(data.product.metafield, null, 2) }],
      };
    }
  );

  // ── Set product metafields (create or update) ─────────────────────
  server.tool(
    "set_product_metafield",
    "Create or update a metafield on a product using the GraphQL `metafieldsSet` mutation (upsert). If the metafield exists it will be updated; otherwise created. Use `type` only when creating a new metafield.",
    {
      product_id: z.string().describe("The numeric Shopify product ID (or GID like 'gid://shopify/Product/123')."),
      namespace: z.string().optional().describe("Metafield namespace (e.g. 'custom'). Omit to use the app-owned namespace."),
      key: z.string().describe("Metafield key (e.g. 'care_instructions')."),
      value: z.string().describe("Metafield value (always a string; JSON/list values must be serialized)."),
      type: z.string().optional().describe("Metafield type (e.g. 'single_line_text_field'). Required when creating a new metafield without an existing definition."),
    },
    async ({ product_id, namespace, key, value, type }) => {
      const gid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;
      const metafield: Record<string, unknown> = { ownerId: gid, key, value };
      if (namespace) metafield.namespace = namespace;
      if (type) metafield.type = type;
      const query = `mutation ($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            type
            jsonValue
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }`;
      const data = await client.graphql<{
        metafieldsSet: { metafields: unknown[]; userErrors: { field: string[]; message: string }[] };
      }>(query, { metafields: [metafield] });
      if (data.metafieldsSet.userErrors.length > 0) {
        throw new Error(`Shopify metafieldsSet errors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.metafieldsSet.metafields, null, 2) }],
      };
    }
  );

  // ── Delete a product metafield ────────────────────────────────────
  server.tool(
    "delete_product_metafield",
    "Permanently delete a metafield by its GID. This cannot be undone.",
    {
      metafield_id: z.string().describe("The metafield GID (e.g. 'gid://shopify/Metafield/123') or numeric ID."),
    },
    async ({ metafield_id }) => {
      const gid = metafield_id.startsWith("gid://") ? metafield_id : `gid://shopify/Metafield/${metafield_id}`;
      const query = `mutation ($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }`;
      const data = await client.graphql<{
        metafieldDelete: { deletedId: string; userErrors: { field: string[]; message: string }[] };
      }>(query, { input: { id: gid } });
      if (data.metafieldDelete.userErrors.length > 0) {
        throw new Error(`Shopify metafieldDelete errors: ${JSON.stringify(data.metafieldDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: `Metafield ${data.metafieldDelete.deletedId} deleted successfully.` }],
      };
    }
  );

  // ── List metafield definitions (store-level) ──────────────────────
  server.tool(
    "list_metafield_definitions",
    "List all metafield definitions for products at the store level. Returns namespace, key, type, name, description, and validations via GraphQL.",
    {
      namespace: z.string().optional().describe("Filter by namespace (e.g. 'custom')."),
    },
    async ({ namespace }) => {
      const query = `query ($namespace: String) {
        metafieldDefinitions(ownerType: PRODUCT, first: 100, namespace: $namespace) {
          edges {
            node {
              id
              name
              namespace
              key
              type { name }
              description
              pinnedPosition
              validations { name value }
            }
          }
        }
      }`;
      const data = await client.graphql<{
        metafieldDefinitions: { edges: { node: unknown }[] };
      }>(query, namespace ? { namespace } : undefined);
      const definitions = data.metafieldDefinitions.edges.map((e) => e.node);
      return {
        content: [{ type: "text", text: JSON.stringify(definitions, null, 2) }],
      };
    }
  );
}
