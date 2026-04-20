import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerPageTools(server: McpServer, client: ShopifyClient) {
  // ── List pages ─────────────────────────────────────────────────────
  server.tool(
    "list_pages",
    "List online store pages (e.g. About Us, Contact, policy pages). Supports filtering by title, handle, published status, and date ranges. Requires read_content or read_online_store_pages access scope.",
    {
      limit: z.number().min(1).max(250).default(50).describe("Number of pages to return (1–250). Default: 50."),
      after: z.string().optional().describe("Cursor for forward pagination (from previous response pageInfo.endCursor)."),
      query: z
        .string()
        .optional()
        .describe(
          "Filter query. Supports: title:<text>, handle:<handle>, published_status:published|unpublished, created_at:>'2024-01-01', updated_at:<now, id:>=1234."
        ),
      sort_key: z
        .enum(["ID", "TITLE", "UPDATED_AT", "PUBLISHED_AT"])
        .optional()
        .describe("Field to sort by. Default: ID."),
      reverse: z.boolean().optional().describe("Reverse sort order."),
    },
    async ({ limit, after, query, sort_key, reverse }) => {
      const gqlQuery = `
        query ListPages($first: Int!, $after: String, $query: String, $sortKey: PageSortKeys, $reverse: Boolean) {
          pages(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
            nodes {
              id
              title
              handle
              bodySummary
              isPublished
              publishedAt
              templateSuffix
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
        pages: { nodes: unknown[]; pageInfo: unknown };
      }>(gqlQuery, { first: limit, after: after ?? null, query: query ?? null, sortKey: sort_key ?? null, reverse: reverse ?? null });
      return {
        content: [{ type: "text", text: JSON.stringify(data.pages, null, 2) }],
      };
    }
  );

  // ── Get page ───────────────────────────────────────────────────────
  server.tool(
    "get_page",
    "Get full details of a single online store page by its ID, including body HTML. Requires read_content or read_online_store_pages access scope.",
    {
      page_id: z.string().describe("The numeric Shopify page ID or GID (e.g. 'gid://shopify/Page/123')."),
    },
    async ({ page_id }) => {
      const gid = page_id.startsWith("gid://") ? page_id : `gid://shopify/Page/${page_id}`;
      const gqlQuery = `
        query GetPage($id: ID!) {
          page(id: $id) {
            id
            title
            handle
            body
            bodySummary
            isPublished
            publishedAt
            templateSuffix
            createdAt
            updatedAt
          }
        }
      `;
      const data = await client.graphql<{ page: unknown }>(gqlQuery, { id: gid });
      return {
        content: [{ type: "text", text: JSON.stringify(data.page, null, 2) }],
      };
    }
  );

  // ── Create page ────────────────────────────────────────────────────
  server.tool(
    "create_page",
    "Create a new online store page (e.g. About Us, Contact, policy pages). Requires write_content or write_online_store_pages access scope.",
    {
      title: z.string().describe("Page title (required)."),
      body: z.string().optional().describe("Page body content in HTML."),
      handle: z.string().optional().describe("URL handle for the page (auto-generated from title if omitted)."),
      is_published: z.boolean().optional().describe("Whether the page is published and visible. Default: true."),
      published_at: z.string().optional().describe("Schedule publication date (ISO 8601). Only used when is_published is true."),
      template_suffix: z.string().optional().describe("Custom template suffix (e.g. 'contact' uses template 'page.contact.liquid')."),
    },
    async ({ title, body, handle, is_published, published_at, template_suffix }) => {
      const mutation = `
        mutation CreatePage($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page {
              id
              title
              handle
              isPublished
              publishedAt
              templateSuffix
              createdAt
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;
      const pageInput: Record<string, unknown> = { title };
      if (body !== undefined) pageInput.body = body;
      if (handle !== undefined) pageInput.handle = handle;
      if (is_published !== undefined) pageInput.isPublished = is_published;
      if (published_at !== undefined) pageInput.publishedAt = published_at;
      if (template_suffix !== undefined) pageInput.templateSuffix = template_suffix;

      const data = await client.graphql<{
        pageCreate: { page: unknown; userErrors: { code: string; field: string[]; message: string }[] };
      }>(mutation, { page: pageInput });
      return {
        content: [{ type: "text", text: JSON.stringify(data.pageCreate, null, 2) }],
      };
    }
  );

  // ── Update page ────────────────────────────────────────────────────
  server.tool(
    "update_page",
    "Update an existing online store page. Only provided fields are changed. Requires write_content or write_online_store_pages access scope.",
    {
      page_id: z.string().describe("The numeric Shopify page ID or GID."),
      title: z.string().optional().describe("New page title."),
      body: z.string().optional().describe("New page body in HTML."),
      handle: z.string().optional().describe("New URL handle."),
      is_published: z.boolean().optional().describe("Whether the page is published."),
      published_at: z.string().optional().describe("Schedule publication date (ISO 8601)."),
      template_suffix: z.string().optional().describe("New custom template suffix."),
    },
    async ({ page_id, title, body, handle, is_published, published_at, template_suffix }) => {
      const gid = page_id.startsWith("gid://") ? page_id : `gid://shopify/Page/${page_id}`;
      const mutation = `
        mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page {
              id
              title
              handle
              isPublished
              publishedAt
              templateSuffix
              updatedAt
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;
      const pageInput: Record<string, unknown> = {};
      if (title !== undefined) pageInput.title = title;
      if (body !== undefined) pageInput.body = body;
      if (handle !== undefined) pageInput.handle = handle;
      if (is_published !== undefined) pageInput.isPublished = is_published;
      if (published_at !== undefined) pageInput.publishedAt = published_at;
      if (template_suffix !== undefined) pageInput.templateSuffix = template_suffix;

      const data = await client.graphql<{
        pageUpdate: { page: unknown; userErrors: { code: string; field: string[]; message: string }[] };
      }>(mutation, { id: gid, page: pageInput });
      return {
        content: [{ type: "text", text: JSON.stringify(data.pageUpdate, null, 2) }],
      };
    }
  );

  // ── Delete page ────────────────────────────────────────────────────
  server.tool(
    "delete_page",
    "Permanently delete an online store page. This cannot be undone. Requires write_content or write_online_store_pages access scope.",
    {
      page_id: z.string().describe("The numeric Shopify page ID or GID to delete."),
    },
    async ({ page_id }) => {
      const gid = page_id.startsWith("gid://") ? page_id : `gid://shopify/Page/${page_id}`;
      const mutation = `
        mutation DeletePage($id: ID!) {
          pageDelete(id: $id) {
            deletedPageId
            userErrors {
              code
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        pageDelete: { deletedPageId: string | null; userErrors: { code: string; field: string[]; message: string }[] };
      }>(mutation, { id: gid });
      return {
        content: [{ type: "text", text: JSON.stringify(data.pageDelete, null, 2) }],
      };
    }
  );
}
