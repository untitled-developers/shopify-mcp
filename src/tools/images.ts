import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerImageTools(server: McpServer, client: ShopifyClient) {
  // ── List product images ───────────────────────────────────────────
  server.tool(
    "list_product_images",
    "List all images for a product.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of images to return. Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ product_id, limit, page_info }) => {
      const data = await client.request<{ images: unknown[] }>(`products/${product_id}/images.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.images, null, 2) }],
      };
    }
  );

  // ── Get a product image ───────────────────────────────────────────
  server.tool(
    "get_product_image",
    "Get details of a single product image.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      image_id: z.string().describe("The numeric image ID."),
    },
    async ({ product_id, image_id }) => {
      const data = await client.request<{ image: unknown }>(`products/${product_id}/images/${image_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.image, null, 2) }],
      };
    }
  );

  // ── Create a product image ────────────────────────────────────────
  server.tool(
    "create_product_image",
    "Add an image to a product by URL. Optionally assign it to specific variants.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      src: z.string().describe("Image URL to upload."),
      alt: z.string().optional().describe("Alt text for the image."),
      position: z.number().optional().describe("Position/order of the image (1 = first)."),
      variant_ids: z.array(z.string()).optional().describe("Variant IDs to associate this image with."),
    },
    async ({ product_id, src, alt, position, variant_ids }) => {
      const image: Record<string, unknown> = { src };
      if (alt) image.alt = alt;
      if (position !== undefined) image.position = position;
      if (variant_ids) image.variant_ids = variant_ids;
      const data = await client.request<{ image: unknown }>(`products/${product_id}/images.json`, {
        method: "POST",
        body: { image },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.image, null, 2) }],
      };
    }
  );

  // ── Update a product image ────────────────────────────────────────
  server.tool(
    "update_product_image",
    "Update a product image (change alt text, position, or variant assignments).",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      image_id: z.string().describe("The numeric image ID."),
      alt: z.string().optional().describe("New alt text."),
      position: z.number().optional().describe("New position."),
      variant_ids: z.array(z.string()).optional().describe("New variant IDs to associate with."),
    },
    async ({ product_id, image_id, ...fields }) => {
      const image: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) image[k] = v;
      }
      const data = await client.request<{ image: unknown }>(`products/${product_id}/images/${image_id}.json`, {
        method: "PUT",
        body: { image },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.image, null, 2) }],
      };
    }
  );

  // ── Delete a product image ────────────────────────────────────────
  server.tool(
    "delete_product_image",
    "Delete an image from a product.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      image_id: z.string().describe("The numeric image ID to delete."),
    },
    async ({ product_id, image_id }) => {
      await client.request(`products/${product_id}/images/${image_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Image ${image_id} deleted from product ${product_id}.` }],
      };
    }
  );
}
