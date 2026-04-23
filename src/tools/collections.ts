import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerCollectionTools(server: McpServer, client: ShopifyClient) {
  // ── List custom collections ───────────────────────────────────────
  server.tool(
    "list_custom_collections",
    "List custom (manual) collections. These are collections where the merchant manually selects which products to include.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of collections to return (1–250). Default: 10."),
      since_id: z.string().optional().describe("Return collections after this ID."),
      title: z.string().optional().describe("Filter by exact title match."),
      product_id: z.string().optional().describe("Filter collections that contain this product ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, title, product_id, page_info }) => {
      const data = await client.request<{ custom_collections: unknown[] }>("custom_collections.json", {
        params: { limit, since_id, title, product_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.custom_collections, null, 2) }],
      };
    }
  );

  // ── List smart collections ────────────────────────────────────────
  server.tool(
    "list_smart_collections",
    "List smart (automatic) collections. These are collections where products are automatically included based on rules.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of collections to return (1–250). Default: 10."),
      since_id: z.string().optional().describe("Return collections after this ID."),
      title: z.string().optional().describe("Filter by exact title match."),
      product_id: z.string().optional().describe("Filter collections that contain this product ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, title, product_id, page_info }) => {
      const data = await client.request<{ smart_collections: unknown[] }>("smart_collections.json", {
        params: { limit, since_id, title, product_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.smart_collections, null, 2) }],
      };
    }
  );

  // ── Get a custom collection ───────────────────────────────────────
  server.tool(
    "get_custom_collection",
    "Get full details of a single custom collection by its ID.",
    {
      collection_id: z.string().describe("The numeric Shopify custom collection ID."),
    },
    async ({ collection_id }) => {
      const data = await client.request<{ custom_collection: unknown }>(`custom_collections/${collection_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.custom_collection, null, 2) }],
      };
    }
  );

  // ── Get a smart collection ────────────────────────────────────────
  server.tool(
    "get_smart_collection",
    "Get full details of a single smart collection by its ID, including its rules.",
    {
      collection_id: z.string().describe("The numeric Shopify smart collection ID."),
    },
    async ({ collection_id }) => {
      const data = await client.request<{ smart_collection: unknown }>(`smart_collections/${collection_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.smart_collection, null, 2) }],
      };
    }
  );

  // ── Create a custom collection ────────────────────────────────────
  server.tool(
    "create_custom_collection",
    "Create a new custom (manual) collection. Optionally include product IDs to add to it.",
    {
      title: z.string().describe("Collection title (required)."),
      body_html: z.string().optional().describe("Collection description in HTML."),
      published: z.boolean().default(true).describe("Whether the collection is visible. Default: true."),
      sort_order: z.enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"]).optional().describe("Sort order for products in the collection."),
      image_url: z.string().optional().describe("URL for the collection image."),
      collects: z.array(z.object({
        product_id: z.string().describe("Product ID to add to this collection."),
      })).optional().describe("Products to include in the collection."),
    },
    async ({ title, body_html, published, sort_order, image_url, collects }) => {
      const collection: Record<string, unknown> = { title, published };
      if (body_html) collection.body_html = body_html;
      if (sort_order) collection.sort_order = sort_order;
      if (image_url) collection.image = { src: image_url };
      if (collects) collection.collects = collects;
      const data = await client.request<{ custom_collection: unknown }>("custom_collections.json", {
        method: "POST",
        body: { custom_collection: collection },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.custom_collection, null, 2) }],
      };
    }
  );

  // ── Update a custom collection ────────────────────────────────────
  server.tool(
    "update_custom_collection",
    "Update an existing custom collection. Only provided fields are changed.",
    {
      collection_id: z.string().describe("The numeric Shopify custom collection ID."),
      title: z.string().optional().describe("New title."),
      body_html: z.string().optional().describe("New HTML description."),
      published: z.boolean().optional().describe("Visibility."),
      sort_order: z.enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"]).optional().describe("New sort order."),
    },
    async ({ collection_id, ...fields }) => {
      const collection: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) collection[k] = v;
      }
      const data = await client.request<{ custom_collection: unknown }>(`custom_collections/${collection_id}.json`, {
        method: "PUT",
        body: { custom_collection: collection },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.custom_collection, null, 2) }],
      };
    }
  );

  // ── Delete a custom collection ────────────────────────────────────
  server.tool(
    "delete_custom_collection",
    "Permanently delete a custom collection. Products in it are NOT deleted.",
    {
      collection_id: z.string().describe("The numeric Shopify custom collection ID to delete."),
    },
    async ({ collection_id }) => {
      await client.request(`custom_collections/${collection_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Custom collection ${collection_id} deleted successfully.` }],
      };
    }
  );

  // ── Update a smart collection ─────────────────────────────────────
  server.tool(
    "update_smart_collection",
    "Update a smart (automatic) collection's sort order or other metadata. Only provided fields are changed.",
    {
      collection_id: z.string().describe("The numeric Shopify smart collection ID."),
      title: z.string().optional().describe("New title."),
      body_html: z.string().optional().describe("New HTML description."),
      sort_order: z
        .enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"])
        .optional()
        .describe("New sort order for products in this collection."),
    },
    async ({ collection_id, title, body_html, sort_order }) => {
      const collection: Record<string, unknown> = {};
      if (title !== undefined) collection.title = title;
      if (body_html !== undefined) collection.body_html = body_html;
      if (sort_order !== undefined) collection.sort_order = sort_order;
      const data = await client.request<{ smart_collection: unknown }>(`smart_collections/${collection_id}.json`, {
        method: "PUT",
        body: { smart_collection: collection },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.smart_collection, null, 2) }],
      };
    }
  );

  // ── Reorder products in a custom collection ───────────────────────
  server.tool(
    "reorder_collection_products",
    "Reorder products in a custom collection. Provide an ordered array of product IDs — each product is assigned position 1…N in that order. The collection's sort_order must be 'manual' for positions to be honoured on the storefront. Only the products you list are repositioned; others keep their current positions.",
    {
      collection_id: z.string().describe("The numeric Shopify custom collection ID."),
      product_ids: z
        .array(z.string())
        .min(1)
        .describe("Ordered list of product IDs. The first ID gets position 1, the second gets position 2, and so on."),
    },
    async ({ collection_id, product_ids }) => {
      interface Collect { id: number; product_id: number }
      const allCollects: Collect[] = [];
      let since_id: string | undefined;
      // Paginate through all collects using since_id (REST cursor)
      do {
        const page = await client.request<{ collects: Collect[] }>("collects.json", {
          params: { collection_id, limit: 250, ...(since_id ? { since_id } : {}) },
        });
        allCollects.push(...page.collects);
        if (page.collects.length < 250) break;
        since_id = String(page.collects[page.collects.length - 1].id);
      } while (true);

      const collectMap = new Map(allCollects.map((c) => [String(c.product_id), c.id]));

      const missing = product_ids.filter((pid) => !collectMap.has(pid));
      if (missing.length > 0) {
        throw new Error(`Products not found in collection ${collection_id}: ${missing.join(", ")}`);
      }

      const updated: { collect_id: number; product_id: string; position: number }[] = [];
      for (let i = 0; i < product_ids.length; i++) {
        const collectId = collectMap.get(product_ids[i])!;
        await client.request(`collects/${collectId}.json`, {
          method: "PUT",
          body: { collect: { id: collectId, position: i + 1 } },
        });
        updated.push({ collect_id: collectId, product_id: product_ids[i], position: i + 1 });
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ reordered: updated.length, items: updated }, null, 2) }],
      };
    }
  );

  // ── Add product to collection ─────────────────────────────────────
  server.tool(
    "add_product_to_collection",
    "Add a product to a custom collection by creating a collect.",
    {
      product_id: z.string().describe("The product ID to add."),
      collection_id: z.string().describe("The custom collection ID to add the product to."),
    },
    async ({ product_id, collection_id }) => {
      const data = await client.request<{ collect: unknown }>("collects.json", {
        method: "POST",
        body: { collect: { product_id, collection_id } },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.collect, null, 2) }],
      };
    }
  );

  // ── Remove product from collection ────────────────────────────────
  server.tool(
    "remove_product_from_collection",
    "Remove a product from a custom collection. First finds the collect linking them, then deletes it.",
    {
      product_id: z.string().describe("The product ID to remove."),
      collection_id: z.string().describe("The custom collection ID to remove the product from."),
    },
    async ({ product_id, collection_id }) => {
      const data = await client.request<{ collects: { id: number }[] }>("collects.json", {
        params: { product_id, collection_id },
      });
      if (!data.collects || data.collects.length === 0) {
        return {
          content: [{ type: "text", text: `Product ${product_id} is not in collection ${collection_id}.` }],
        };
      }
      await client.request(`collects/${data.collects[0].id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Product ${product_id} removed from collection ${collection_id}.` }],
      };
    }
  );

  // ── List products in a collection ─────────────────────────────────
  server.tool(
    "list_collection_products",
    "List all products belonging to a specific collection (custom or smart).",
    {
      collection_id: z.string().describe("The collection ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of products to return (1–250). Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ collection_id, limit, page_info }) => {
      const data = await client.request<{ products: unknown[] }>(`collections/${collection_id}/products.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.products, null, 2) }],
      };
    }
  );
}
