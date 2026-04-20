import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerThemeTools(server: McpServer, client: ShopifyClient) {
  // ── List themes ────────────────────────────────────────────────────
  server.tool(
    "list_themes",
    "List all themes installed on the online store. Filter by role to find the published (MAIN) theme, unpublished themes, or development themes. Requires read_themes access scope.",
    {
      limit: z.number().min(1).max(250).default(20).describe("Number of themes to return (1–250). Default: 20."),
      roles: z
        .array(z.enum(["MAIN", "UNPUBLISHED", "DEVELOPMENT", "DEMO", "SYSTEM", "TRIAL"]))
        .optional()
        .describe("Filter by theme role(s). Use MAIN for the published theme."),
    },
    async ({ limit, roles }) => {
      const query = `
        query ListThemes($first: Int!, $roles: [ThemeRole!]) {
          themes(first: $first, roles: $roles) {
            nodes {
              id
              name
              role
              processing
              processingFailed
              themeStoreId
              createdAt
              updatedAt
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      const data = await client.graphql<{
        themes: { nodes: unknown[]; pageInfo: unknown };
      }>(query, { first: limit, roles: roles ?? null });
      return {
        content: [{ type: "text", text: JSON.stringify(data.themes, null, 2) }],
      };
    }
  );

  // ── Get theme ──────────────────────────────────────────────────────
  server.tool(
    "get_theme",
    "Get details of a single theme by its GID. Requires read_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
    },
    async ({ theme_id }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const query = `
        query GetTheme($id: ID!) {
          theme(id: $id) {
            id
            name
            role
            processing
            processingFailed
            themeStoreId
            prefix
            createdAt
            updatedAt
          }
        }
      `;
      const data = await client.graphql<{ theme: unknown }>(query, { id: gid });
      return {
        content: [{ type: "text", text: JSON.stringify(data.theme, null, 2) }],
      };
    }
  );

  // ── Create theme ───────────────────────────────────────────────────
  server.tool(
    "create_theme",
    "Create a new theme from a public ZIP URL or a staged upload URL. New themes are UNPUBLISHED by default. Requires write_themes access scope.",
    {
      source: z.string().describe("Public URL of a theme ZIP file or a staged upload URL."),
      name: z.string().optional().describe("Display name for the theme."),
      role: z
        .enum(["UNPUBLISHED", "DEVELOPMENT"])
        .optional()
        .describe("Theme role. Default: UNPUBLISHED. Use DEVELOPMENT for temporary dev themes."),
    },
    async ({ source, name, role }) => {
      const mutation = `
        mutation CreateTheme($source: URL!, $name: String, $role: ThemeRole) {
          themeCreate(source: $source, name: $name, role: $role) {
            theme {
              id
              name
              role
              processing
              processingFailed
              createdAt
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        themeCreate: { theme: unknown; userErrors: { field: string[]; message: string }[] };
      }>(mutation, { source, name: name ?? null, role: role ?? null });
      if (data.themeCreate.userErrors.length > 0) {
        throw new Error(`themeCreate errors: ${JSON.stringify(data.themeCreate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.themeCreate.theme, null, 2) }],
      };
    }
  );

  // ── Update theme ───────────────────────────────────────────────────
  server.tool(
    "update_theme",
    "Update a theme's name. Requires write_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme to update (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
      name: z.string().describe("New display name for the theme."),
    },
    async ({ theme_id, name }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const mutation = `
        mutation UpdateTheme($id: ID!, $input: OnlineStoreThemeInput!) {
          themeUpdate(id: $id, input: $input) {
            theme {
              id
              name
              role
              updatedAt
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        themeUpdate: { theme: unknown; userErrors: { field: string[]; message: string }[] };
      }>(mutation, { id: gid, input: { name } });
      if (data.themeUpdate.userErrors.length > 0) {
        throw new Error(`themeUpdate errors: ${JSON.stringify(data.themeUpdate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.themeUpdate.theme, null, 2) }],
      };
    }
  );

  // ── Publish theme ──────────────────────────────────────────────────
  server.tool(
    "publish_theme",
    "Publish a theme, making it the live storefront theme (MAIN role). Requires write_themes access scope and a Shopify exemption for theme modification.",
    {
      theme_id: z.string().describe("The GID of the theme to publish (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
    },
    async ({ theme_id }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const mutation = `
        mutation PublishTheme($id: ID!) {
          themePublish(id: $id) {
            theme {
              id
              name
              role
              updatedAt
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
        themePublish: { theme: unknown; userErrors: { field: string[]; message: string; code: string }[] };
      }>(mutation, { id: gid });
      if (data.themePublish.userErrors.length > 0) {
        throw new Error(`themePublish errors: ${JSON.stringify(data.themePublish.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.themePublish.theme, null, 2) }],
      };
    }
  );

  // ── Delete theme ───────────────────────────────────────────────────
  server.tool(
    "delete_theme",
    "Delete a theme. The active (MAIN) theme cannot be deleted. Requires write_themes access scope and a Shopify exemption.",
    {
      theme_id: z.string().describe("The GID of the theme to delete (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
    },
    async ({ theme_id }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const mutation = `
        mutation DeleteTheme($id: ID!) {
          themeDelete(id: $id) {
            deletedThemeId
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        themeDelete: { deletedThemeId: string | null; userErrors: { field: string[]; message: string }[] };
      }>(mutation, { id: gid });
      if (data.themeDelete.userErrors.length > 0) {
        throw new Error(`themeDelete errors: ${JSON.stringify(data.themeDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: `Theme ${data.themeDelete.deletedThemeId} deleted successfully.` }],
      };
    }
  );

  // ── List theme files ───────────────────────────────────────────────
  server.tool(
    "list_theme_files",
    "List all files in a theme (templates, assets, sections, snippets, config, locales). Requires read_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
      limit: z.number().min(1).max(250).default(50).describe("Number of files to return (1–250). Default: 50."),
      after: z.string().optional().describe("Cursor for forward pagination."),
    },
    async ({ theme_id, limit, after }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const query = `
        query ListThemeFiles($id: ID!, $first: Int!, $after: String) {
          theme(id: $id) {
            files(first: $first, after: $after) {
              nodes {
                filename
                contentType
                size
                checksumMd5
                createdAt
                updatedAt
              }
              pageInfo {
                hasNextPage
                endCursor
              }
              userErrors {
                code
                filename
              }
            }
          }
        }
      `;
      const data = await client.graphql<{
        theme: {
          files: { nodes: unknown[]; pageInfo: unknown; userErrors: { code: string; filename: string }[] };
        } | null;
      }>(query, { id: gid, first: limit, after: after ?? null });
      if (!data.theme) {
        return { content: [{ type: "text", text: `Theme not found: ${theme_id}` }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.theme.files, null, 2) }],
      };
    }
  );

  // ── Get theme files (by filename) ──────────────────────────────────
  server.tool(
    "get_theme_files",
    "Get one or more specific theme files by their filenames, including their full content. Requires read_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
      filenames: z
        .array(z.string())
        .min(1)
        .describe("Filenames to retrieve (e.g. ['templates/index.json', 'assets/theme.css', 'sections/header.liquid'])."),
    },
    async ({ theme_id, filenames }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const query = `
        query GetThemeFiles($id: ID!, $filenames: [String!]!) {
          theme(id: $id) {
            files(filenames: $filenames) {
              nodes {
                filename
                contentType
                size
                checksumMd5
                createdAt
                updatedAt
                body {
                  ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
                  ... on OnlineStoreThemeFileBodyText { content }
                  ... on OnlineStoreThemeFileBodyUrl { url }
                }
              }
              userErrors {
                code
                filename
              }
            }
          }
        }
      `;
      const data = await client.graphql<{
        theme: {
          files: { nodes: unknown[]; userErrors: { code: string; filename: string }[] };
        } | null;
      }>(query, { id: gid, filenames });
      if (!data.theme) {
        return { content: [{ type: "text", text: `Theme not found: ${theme_id}` }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.theme.files, null, 2) }],
      };
    }
  );

  // ── Upsert theme files ─────────────────────────────────────────────
  server.tool(
    "upsert_theme_files",
    "Create or update theme files (up to 50 per request). Provide file content as text or base64. Requires write_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme to update (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
      files: z
        .array(
          z.object({
            filename: z.string().describe("Path of the file in the theme (e.g. 'assets/custom.css', 'sections/hero.liquid')."),
            body: z.union([
              z.object({
                type: z.literal("text").describe("Provide file content as plain text."),
                content: z.string().describe("Text content of the file."),
              }),
              z.object({
                type: z.literal("base64").describe("Provide file content as a base64-encoded string."),
                contentBase64: z.string().describe("Base64-encoded file content."),
              }),
              z.object({
                type: z.literal("url").describe("Provide file content via a publicly accessible URL."),
                url: z.string().describe("URL of the file content."),
              }),
            ]).describe("File body content."),
          })
        )
        .min(1)
        .max(50)
        .describe("Files to create or update (max 50)."),
    },
    async ({ theme_id, files }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;

      const mappedFiles = files.map(({ filename, body }) => {
        let bodyInput: Record<string, unknown>;
        if (body.type === "text") {
          bodyInput = { text: { content: body.content } };
        } else if (body.type === "base64") {
          bodyInput = { base64: { contentBase64: body.contentBase64 } };
        } else {
          bodyInput = { url: { url: body.url } };
        }
        return { filename, body: bodyInput };
      });

      const mutation = `
        mutation UpsertThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
          themeFilesUpsert(themeId: $themeId, files: $files) {
            upsertedThemeFiles {
              filename
              contentType
              size
              checksumMd5
              createdAt
              updatedAt
            }
            userErrors {
              code
              filename
              message
              field
            }
          }
        }
      `;
      const data = await client.graphql<{
        themeFilesUpsert: {
          upsertedThemeFiles: unknown[];
          userErrors: { code: string; filename: string; message: string; field: string[] }[];
        };
      }>(mutation, { themeId: gid, files: mappedFiles });
      if (data.themeFilesUpsert.userErrors.length > 0) {
        throw new Error(`themeFilesUpsert errors: ${JSON.stringify(data.themeFilesUpsert.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.themeFilesUpsert.upsertedThemeFiles, null, 2) }],
      };
    }
  );

  // ── Delete theme files ─────────────────────────────────────────────
  server.tool(
    "delete_theme_files",
    "Delete one or more files from a theme by filename. Requires write_themes access scope.",
    {
      theme_id: z.string().describe("The GID of the theme (e.g. 'gid://shopify/OnlineStoreTheme/123')."),
      filenames: z
        .array(z.string())
        .min(1)
        .describe("Filenames of the files to delete (e.g. ['assets/old.css', 'sections/deprecated.liquid'])."),
    },
    async ({ theme_id, filenames }) => {
      const gid = theme_id.startsWith("gid://") ? theme_id : `gid://shopify/OnlineStoreTheme/${theme_id}`;
      const mutation = `
        mutation DeleteThemeFiles($themeId: ID!, $files: [String!]!) {
          themeFilesDelete(themeId: $themeId, files: $files) {
            deletedThemeFiles {
              filename
              contentType
              size
              checksumMd5
              createdAt
              updatedAt
            }
            userErrors {
              code
              filename
              message
              field
            }
          }
        }
      `;
      const data = await client.graphql<{
        themeFilesDelete: {
          deletedThemeFiles: unknown[];
          userErrors: { code: string; filename: string; message: string; field: string[] }[];
        };
      }>(mutation, { themeId: gid, files: filenames });
      if (data.themeFilesDelete.userErrors.length > 0) {
        throw new Error(`themeFilesDelete errors: ${JSON.stringify(data.themeFilesDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.themeFilesDelete.deletedThemeFiles, null, 2) }],
      };
    }
  );
}
