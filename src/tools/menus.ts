import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

interface MenuItemInput {
  title: string;
  url: string;
  type: string;
  resourceId?: string;
  tags?: string[];
  items?: MenuItemInput[];
}

interface MenuItem {
  id: string;
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

const menuItemInputSchema: z.ZodType<MenuItemInput> = z.lazy(() =>
  z.object({
    title: z.string().describe("Menu item label."),
    url: z.string().describe("URL the item links to."),
    type: z.string().describe("Item type (e.g. COLLECTION, PRODUCT, PAGE, BLOG, HTTP, FRONTPAGE, CATALOG, SEARCH, SHOP_POLICY)."),
    resourceId: z.string().optional().describe("GID of the linked resource (e.g. 'gid://shopify/Collection/123')."),
    tags: z.array(z.string()).optional().describe("Tags to filter a collection or blog."),
    items: z.array(menuItemInputSchema).optional().describe("Nested sub-items (max 3 levels deep)."),
  })
);

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
              id
              title
              url
              type
              resourceId
              items {
                id
                title
                url
                type
                resourceId
                items {
                  id
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

  // ── Create menu ────────────────────────────────────────────────────
  server.tool(
    "create_menu",
    "Create a new navigation menu for the online store. Requires write_online_store_navigation access scope.",
    {
      title: z.string().describe("The menu's title."),
      handle: z.string().describe("Unique handle for the menu (e.g. 'sidebar-menu')."),
      items: z.array(menuItemInputSchema).describe("List of menu items. Each item can have nested sub-items up to 3 levels deep."),
    },
    async ({ title, handle, items }) => {
      const query = `
        mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
          menuCreate(title: $title, handle: $handle, items: $items) {
            menu {
              id
              handle
              title
              items {
                id
                title
                url
                type
                resourceId
                items {
                  id
                  title
                  url
                  type
                  resourceId
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        menuCreate: { menu: Menu | null; userErrors: { field: string[]; message: string }[] };
      }>(query, { title, handle, items });
      if (data.menuCreate.userErrors.length > 0) {
        throw new Error(`menuCreate errors: ${JSON.stringify(data.menuCreate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.menuCreate.menu, null, 2) }],
      };
    }
  );

  // ── Update menu ────────────────────────────────────────────────────
  server.tool(
    "update_menu",
    "Update an existing navigation menu's title, handle, and items. Requires write_online_store_navigation access scope.",
    {
      id: z.string().describe("GID of the menu to update (e.g. 'gid://shopify/Menu/123')."),
      title: z.string().describe("New title for the menu."),
      handle: z.string().optional().describe("New handle (cannot be changed for default menus)."),
      items: z.array(
        z.object({
          id: z.string().optional().describe("GID of existing item to update; omit to create a new item."),
          title: z.string().describe("Item label."),
          url: z.string().describe("URL the item links to."),
          type: z.string().describe("Item type (e.g. COLLECTION, PRODUCT, PAGE, HTTP)."),
          resourceId: z.string().optional().describe("GID of the linked resource."),
          items: z.array(z.object({
            id: z.string().optional(),
            title: z.string(),
            url: z.string(),
            type: z.string(),
            resourceId: z.string().optional(),
            items: z.array(z.object({
              id: z.string().optional(),
              title: z.string(),
              url: z.string(),
              type: z.string(),
              resourceId: z.string().optional(),
            })).optional(),
          })).optional().describe("Nested sub-items."),
        })
      ).describe("Complete new item list (replaces existing items)."),
    },
    async ({ id, title, handle, items }) => {
      const query = `
        mutation UpdateMenu($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
          menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
            menu {
              id
              handle
              title
              items {
                id
                title
                url
                type
                resourceId
                items {
                  id
                  title
                  url
                  type
                  resourceId
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        menuUpdate: { menu: Menu | null; userErrors: { field: string[]; message: string }[] };
      }>(query, { id, title, handle: handle ?? null, items });
      if (data.menuUpdate.userErrors.length > 0) {
        throw new Error(`menuUpdate errors: ${JSON.stringify(data.menuUpdate.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.menuUpdate.menu, null, 2) }],
      };
    }
  );

  // ── Delete menu ────────────────────────────────────────────────────
  server.tool(
    "delete_menu",
    "Delete a navigation menu. Default menus (e.g. main-menu, footer-menu) cannot be deleted. Requires write_online_store_navigation access scope.",
    {
      id: z.string().describe("GID of the menu to delete (e.g. 'gid://shopify/Menu/123')."),
    },
    async ({ id }) => {
      const query = `
        mutation DeleteMenu($id: ID!) {
          menuDelete(id: $id) {
            deletedMenuId
            userErrors {
              field
              message
            }
          }
        }
      `;
      const data = await client.graphql<{
        menuDelete: { deletedMenuId: string | null; userErrors: { field: string[]; message: string }[] };
      }>(query, { id });
      if (data.menuDelete.userErrors.length > 0) {
        throw new Error(`menuDelete errors: ${JSON.stringify(data.menuDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: `Menu ${data.menuDelete.deletedMenuId} deleted successfully.` }],
      };
    }
  );
}
