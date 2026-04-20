import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

interface MenuItem {
  title: string;
  url: string;
  type: string;
  resourceId: string | null;
  items: MenuItem[];
}

interface Menu {
  id: string;
  handle: string;
  title: string;
  items?: MenuItem[];
}

export function registerMenuTools(server: McpServer, client: ShopifyClient) {
  // ── List menus ─────────────────────────────────────────────────────
  server.tool(
    "list_menus",
    "List all navigation menus in the store via GraphQL.",
    {
      limit: z.number().min(1).max(250).default(50).describe("Number of menus to return (1–250). Default: 50."),
    },
    async ({ limit }) => {
      const query = `
        query ListMenus($first: Int!) {
          menus(first: $first) {
            nodes {
              id
              handle
              title
            }
          }
        }
      `;
      const data = await client.graphql<{ menus: { nodes: Menu[] } }>(query, { first: limit });
      return {
        content: [{ type: "text", text: JSON.stringify(data.menus.nodes, null, 2) }],
      };
    }
  );

  // ── Get menu by handle ─────────────────────────────────────────────
  server.tool(
    "get_menu",
    "Get a navigation menu by its handle, including its full nested item structure.",
    {
      handle: z.string().describe("The menu handle (e.g. 'main-menu', 'footer-menu', 'categories-mega-menu')."),
    },
    async ({ handle }) => {
      // Step 1: resolve handle → GID
      const listQuery = `
        query ListMenus($first: Int!) {
          menus(first: $first) {
            nodes { id handle title }
          }
        }
      `;
      const listData = await client.graphql<{ menus: { nodes: Menu[] } }>(listQuery, { first: 50 });
      const found = listData.menus.nodes.find((m) => m.handle === handle);
      if (!found) {
        return {
          content: [{ type: "text", text: `No menu found with handle: ${handle}` }],
        };
      }

      // Step 2: fetch full item tree by GID
      const menuQuery = `
        query GetMenu($id: ID!) {
          menu(id: $id) {
            id
            handle
            title
            items {
              title
              url
              type
              resourceId
              items {
                title
                url
                type
                resourceId
                items {
                  title
                  url
                  type
                  resourceId
                }
              }
            }
          }
        }
      `;
      const data = await client.graphql<{ menu: Menu | null }>(menuQuery, { id: found.id });
      if (!data.menu) {
        return {
          content: [{ type: "text", text: `Failed to load menu: ${handle}` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.menu, null, 2) }],
      };
    }
  );
}
