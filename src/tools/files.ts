import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerFileTools(server: McpServer, client: ShopifyClient) {
  // ── List files ─────────────────────────────────────────────────────
  server.tool(
    "list_files",
    "List files uploaded to the store (images, videos, documents, etc.). Supports filtering by media type, filename, status, and more. Requires read_files access scope.",
    {
      limit: z.number().min(1).max(250).default(50).describe("Number of files to return (1–250). Default: 50."),
      after: z.string().optional().describe("Cursor for forward pagination (from previous response pageInfo.endCursor)."),
      query: z
        .string()
        .optional()
        .describe(
          "Filter query. Supports: filename:<name>, media_type:<IMAGE|VIDEO|MODEL_3D|GENERIC_FILE>, status:<READY|PROCESSING|FAILED>, product_id:<id>."
        ),
      sort_key: z
        .enum(["CREATED_AT", "FILENAME", "ID", "ORIGINAL_UPLOAD_SIZE", "UPDATED_AT"])
        .optional()
        .describe("Field to sort by. Default: ID."),
      reverse: z.boolean().optional().describe("Reverse sort order."),
    },
    async ({ limit, after, query, sort_key, reverse }) => {
      const gqlQuery = `
        query ListFiles($first: Int!, $after: String, $query: String, $sortKey: FileSortKeys, $reverse: Boolean) {
          files(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
            nodes {
              id
              alt
              createdAt
              updatedAt
              fileStatus
              ... on MediaImage {
                image { url width height }
                mimeType
                originalSource { url fileSize }
              }
              ... on GenericFile {
                url
                mimeType
                originalFileSize
              }
              ... on Video {
                filename
                duration
                originalSource { url fileSize mimeType }
              }
              ... on ExternalVideo {
                embeddedUrl
                host
              }
              ... on Model3d {
                filename
                originalSource { url fileSize mimeType }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
              hasPreviousPage
              startCursor
            }
          }
        }
      `;
      const data = await client.graphql<{
        files: { nodes: unknown[]; pageInfo: unknown };
      }>(gqlQuery, {
        first: limit,
        after: after ?? null,
        query: query ?? null,
        sortKey: sort_key ?? null,
        reverse: reverse ?? null,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.files, null, 2) }],
      };
    }
  );

  // ── Create file ────────────────────────────────────────────────────
  server.tool(
    "create_file",
    "Create a file asset in the store from an external URL or a staged upload URL. Supports images, videos, 3D models, and generic files. Requires write_files access scope.",
    {
      original_source: z.string().describe("Publicly accessible URL or staged upload URL of the file to import."),
      alt: z.string().optional().describe("Alt text for accessibility."),
      content_type: z
        .enum(["FILE", "IMAGE", "VIDEO", "EXTERNAL_VIDEO", "MODEL_3D"])
        .optional()
        .describe("Type of file content. Shopify will infer from URL if omitted."),
      duplicate_resolution_mode: z
        .enum(["APPEND_UUID", "RAISE_ERROR", "REPLACE"])
        .optional()
        .describe("How to handle duplicate filenames. Default: APPEND_UUID."),
    },
    async ({ original_source, alt, content_type, duplicate_resolution_mode }) => {
      const fileInput: Record<string, unknown> = { originalSource: original_source };
      if (alt) fileInput.alt = alt;
      if (content_type) fileInput.contentType = content_type;
      if (duplicate_resolution_mode) fileInput.duplicateResolutionMode = duplicate_resolution_mode;

      const mutation = `
        mutation CreateFile($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              alt
              createdAt
              fileStatus
              ... on MediaImage { image { url } }
              ... on GenericFile { url }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;
      const data = await client.graphql<{
        fileCreate: { files: unknown[]; userErrors: { field: string[]; message: string; code: string }[] };
      }>(mutation, { files: [fileInput] });
      if (data.fileCreate.userErrors.length > 0) {
        throw new Error(`fileCreate errors: ${JSON.stringify(data.fileCreate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.fileCreate.files, null, 2) }],
      };
    }
  );

  // ── Update file ────────────────────────────────────────────────────
  server.tool(
    "update_file",
    "Update a file's alt text, filename, or content (by providing a new source URL). The file must be in READY state. Requires write_files access scope.",
    {
      id: z.string().describe("GID of the file to update (e.g. 'gid://shopify/MediaImage/123' or 'gid://shopify/GenericFile/123')."),
      alt: z.string().optional().describe("New alt text for accessibility."),
      filename: z.string().optional().describe("New filename (extension must match original)."),
      original_source: z.string().optional().describe("New source URL to replace file content (preserves URL)."),
    },
    async ({ id, alt, filename, original_source }) => {
      const fileInput: Record<string, unknown> = { id };
      if (alt !== undefined) fileInput.alt = alt;
      if (filename !== undefined) fileInput.filename = filename;
      if (original_source !== undefined) fileInput.originalSource = original_source;

      const mutation = `
        mutation UpdateFile($files: [FileUpdateInput!]!) {
          fileUpdate(files: $files) {
            files {
              id
              alt
              updatedAt
              fileStatus
              ... on MediaImage { image { url } mimeType }
              ... on GenericFile { url mimeType }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;
      const data = await client.graphql<{
        fileUpdate: { files: unknown[]; userErrors: { field: string[]; message: string; code: string }[] };
      }>(mutation, { files: [fileInput] });
      if (data.fileUpdate.userErrors.length > 0) {
        throw new Error(`fileUpdate errors: ${JSON.stringify(data.fileUpdate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.fileUpdate.files, null, 2) }],
      };
    }
  );

  // ── Delete files ───────────────────────────────────────────────────
  server.tool(
    "delete_files",
    "Permanently delete one or more files by their GIDs. This cannot be undone. Requires write_files access scope.",
    {
      file_ids: z
        .array(z.string())
        .min(1)
        .describe("Array of file GIDs to delete (e.g. ['gid://shopify/MediaImage/123', 'gid://shopify/GenericFile/456'])."),
    },
    async ({ file_ids }) => {
      const mutation = `
        mutation DeleteFiles($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors {
              field
              message
              code
            }
          }
        }
      `;
      const data = await client.graphql<{
        fileDelete: { deletedFileIds: string[]; userErrors: { field: string[]; message: string; code: string }[] };
      }>(mutation, { fileIds: file_ids });
      if (data.fileDelete.userErrors.length > 0) {
        throw new Error(`fileDelete errors: ${JSON.stringify(data.fileDelete.userErrors)}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `Deleted ${data.fileDelete.deletedFileIds.length} file(s): ${data.fileDelete.deletedFileIds.join(", ")}`,
          },
        ],
      };
    }
  );
}
