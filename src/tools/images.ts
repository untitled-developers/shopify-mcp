import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, throwOnUserErrors } from "./graphql-helpers.js";

const MEDIA_FIELDS = `
  id
  alt
  mediaContentType
  status
  preview { image { url altText } }
  ... on MediaImage { image { url altText width height } }
`;

export function registerImageTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_product_images",
    "List all images for a product.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of images to return. Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ product_id, limit, page_info }) => {
      const query = `
        query ListProductImages($id: ID!, $first: Int!, $after: String) {
          product(id: $id) {
            media(first: $first, after: $after) {
              nodes { ${MEDIA_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `;
      const data = await client.graphql<{ product: { media: { nodes: unknown[]; pageInfo: unknown } } }>(query, {
        id: gid("Product", product_id),
        first: limit,
        after: page_info ?? null,
      });
      return { content: [{ type: "text", text: JSON.stringify({ images: data.product.media.nodes, pageInfo: data.product.media.pageInfo }, null, 2) }] };
    }
  );

  server.tool(
    "get_product_image",
    "Get details of a single product image.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      image_id: z.string().describe("The numeric image ID."),
    },
    async ({ image_id }) => {
      const query = `query GetProductImage($id: ID!) { node(id: $id) { ... on MediaImage { ${MEDIA_FIELDS} } } }`;
      const data = await client.graphql<{ node: unknown }>(query, { id: gid("MediaImage", image_id) });
      return { content: [{ type: "text", text: JSON.stringify(data.node, null, 2) }] };
    }
  );

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
    async ({ product_id, src, alt }) => {
      const mutation = `
        mutation CreateProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { id alt mediaContentType status }
            mediaUserErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productCreateMedia: { media: unknown[]; mediaUserErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: gid("Product", product_id),
        media: [compact({ originalSource: src, alt, mediaContentType: "IMAGE" })],
      });
      throwOnUserErrors("productCreateMedia", data.productCreateMedia.mediaUserErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.productCreateMedia.media[0] ?? null, null, 2) }] };
    }
  );

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
    async ({ product_id, image_id, alt }) => {
      const mutation = `
        mutation UpdateProductMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            media { id alt mediaContentType status }
            mediaUserErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productUpdateMedia: { media: unknown[]; mediaUserErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: gid("Product", product_id),
        media: [compact({ id: gid("MediaImage", image_id), alt })],
      });
      throwOnUserErrors("productUpdateMedia", data.productUpdateMedia.mediaUserErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.productUpdateMedia.media[0] ?? null, null, 2) }] };
    }
  );

  server.tool(
    "delete_product_image",
    "Delete an image from a product.",
    {
      product_id: z.string().describe("The numeric Shopify product ID."),
      image_id: z.string().describe("The numeric image ID to delete."),
    },
    async ({ product_id, image_id }) => {
      const mutation = `
        mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            mediaUserErrors { field message }
          }
        }
      `;
      const data = await client.graphql<{ productDeleteMedia: { deletedMediaIds: string[]; mediaUserErrors: { field?: string[]; message: string }[] } }>(mutation, {
        productId: gid("Product", product_id),
        mediaIds: [gid("MediaImage", image_id)],
      });
      throwOnUserErrors("productDeleteMedia", data.productDeleteMedia.mediaUserErrors);
      return { content: [{ type: "text", text: `Image ${data.productDeleteMedia.deletedMediaIds[0] ?? image_id} deleted from product ${product_id}.` }] };
    }
  );
}