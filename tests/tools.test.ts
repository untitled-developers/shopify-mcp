import { describe, it, expect, vi, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ShopifyClient } from "../src/shopify-client.js";

// Mock auth to avoid real API calls
vi.mock("../src/auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

// Import all register functions
import { registerShopTools } from "../src/tools/shop.js";
import { registerProductTools } from "../src/tools/products.js";
import { registerOrderTools } from "../src/tools/orders.js";
import { registerCustomerTools } from "../src/tools/customers.js";
import { registerInventoryTools } from "../src/tools/inventory.js";
import { registerCollectionTools } from "../src/tools/collections.js";
import { registerVariantTools } from "../src/tools/variants.js";
import { registerDraftOrderTools } from "../src/tools/draft-orders.js";
import { registerDiscountTools } from "../src/tools/discounts.js";
import { registerFulfillmentTools } from "../src/tools/fulfillments.js";
import { registerWebhookTools } from "../src/tools/webhooks.js";
import { registerImageTools } from "../src/tools/images.js";
import { registerMenuTools } from "../src/tools/menus.js";
import { registerFileTools } from "../src/tools/files.js";
import { registerAppTools } from "../src/tools/apps.js";
import { registerThemeTools } from "../src/tools/themes.js";
import { registerPageTools } from "../src/tools/pages.js";

const testConfig = {
  storeName: "test-store",
  clientId: "test-id",
  clientSecret: "test-secret",
  apiVersion: "2026-01",
};

const EXPECTED_TOOL_NAMES = [
  // shop (1)
  "get_shop_info",
  // products (11)
  "list_products", "get_product", "create_product", "update_product", "delete_product",
  "list_product_metafields", "get_product_metafield", "set_product_metafield", "delete_product_metafield",
  "list_metafield_definitions", "create_metafield_definition",
  // images (5)
  "list_product_images", "get_product_image", "create_product_image", "update_product_image", "delete_product_image",
  // variants (5)
  "list_variants", "get_variant", "create_variant", "update_variant", "delete_variant",
  // collections (10)
  "list_custom_collections", "list_smart_collections", "get_custom_collection", "get_smart_collection",
  "create_custom_collection", "update_custom_collection", "delete_custom_collection",
  "add_product_to_collection", "remove_product_from_collection", "list_collection_products",
  // orders (9)
  "list_orders", "get_order", "update_order", "close_order", "cancel_order",
  "list_order_metafields", "get_order_metafield", "set_order_metafield", "delete_order_metafield",
  // customers (9)
  "list_customers", "search_customers", "get_customer", "create_customer", "update_customer",
  "list_customer_metafields", "get_customer_metafield", "set_customer_metafield", "delete_customer_metafield",
  // inventory (5)
  "list_locations", "get_location", "list_inventory_levels", "adjust_inventory", "set_inventory",
  // draft orders (7)
  "list_draft_orders", "get_draft_order", "create_draft_order", "update_draft_order",
  "complete_draft_order", "send_draft_order_invoice", "delete_draft_order",
  // discounts (8)
  "list_price_rules", "get_price_rule", "create_price_rule", "update_price_rule", "delete_price_rule",
  "list_discount_codes", "create_discount_code", "delete_discount_code",
  // fulfillments (5)
  "list_fulfillment_orders", "list_fulfillments", "create_fulfillment", "update_fulfillment_tracking", "cancel_fulfillment",
  // webhooks (5)
  "list_webhooks", "get_webhook", "create_webhook", "update_webhook", "delete_webhook",
  // menus (5)
  "list_menus", "get_menu", "create_menu", "update_menu", "delete_menu",
  // files (4)
  "list_files", "create_file", "update_file", "delete_files",
  // apps (2)
  "list_app_installations", "get_app_installation",
  // themes (10)
  "list_themes", "get_theme", "create_theme", "update_theme", "publish_theme", "delete_theme",
  "list_theme_files", "get_theme_files", "upsert_theme_files", "delete_theme_files",
  // pages (5)
  "list_pages", "get_page", "create_page", "update_page", "delete_page",
].sort();

describe("Tool Registration", () => {
  let server: McpServer;
  let client: ShopifyClient;

  // Track registered tool names by spying on server.tool
  let registeredTools: string[];

  beforeAll(() => {
    server = new McpServer({ name: "test-server", version: "0.0.0" });
    client = new ShopifyClient(testConfig);
    registeredTools = [];

    // Spy on server.tool to capture registered names
    const originalTool = server.tool.bind(server);
    server.tool = ((...args: any[]) => {
      registeredTools.push(args[0]);
      return originalTool(...args);
    }) as any;

    // Register all tool groups
    registerShopTools(server, client);
    registerProductTools(server, client);
    registerOrderTools(server, client);
    registerCustomerTools(server, client);
    registerInventoryTools(server, client);
    registerCollectionTools(server, client);
    registerVariantTools(server, client);
    registerDraftOrderTools(server, client);
    registerDiscountTools(server, client);
    registerFulfillmentTools(server, client);
    registerWebhookTools(server, client);
    registerImageTools(server, client);
    registerMenuTools(server, client);
    registerFileTools(server, client);
    registerAppTools(server, client);
    registerThemeTools(server, client);
    registerPageTools(server, client);
  });

  it("registers exactly 106 tools", () => {
    expect(registeredTools).toHaveLength(106);
  });

  it("registers all expected tool names", () => {
    const sorted = [...registeredTools].sort();
    expect(sorted).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("has no duplicate tool names", () => {
    const unique = new Set(registeredTools);
    expect(unique.size).toBe(registeredTools.length);
  });

  describe("tool groups register correct counts", () => {
    const expectedCounts: Record<string, number> = {
      shop: 1,
      products: 11,
      images: 5,
      variants: 5,
      collections: 10,
      orders: 9,
      customers: 9,
      inventory: 5,
      "draft-orders": 7,
      discounts: 8,
      fulfillments: 5,
      webhooks: 5,
      menus: 5,
      files: 4,
      apps: 2,
      themes: 10,
      pages: 5,
    };

    for (const [group, count] of Object.entries(expectedCounts)) {
      it(`${group}: ${count} tools`, () => {
        // Verify by creating a fresh server and registering only this group
        const s = new McpServer({ name: "count-test", version: "0.0.0" });
        const c = new ShopifyClient(testConfig);
        const names: string[] = [];
        const orig = s.tool.bind(s);
        s.tool = ((...a: any[]) => { names.push(a[0]); return orig(...a); }) as any;

        const registerFns: Record<string, Function> = {
          shop: registerShopTools,
          products: registerProductTools,
          images: registerImageTools,
          variants: registerVariantTools,
          collections: registerCollectionTools,
          orders: registerOrderTools,
          customers: registerCustomerTools,
          inventory: registerInventoryTools,
          "draft-orders": registerDraftOrderTools,
          discounts: registerDiscountTools,
          fulfillments: registerFulfillmentTools,
          webhooks: registerWebhookTools,
          menus: registerMenuTools,
          files: registerFileTools,
          apps: registerAppTools,
          themes: registerThemeTools,
          pages: registerPageTools,
        };

        registerFns[group](s, c);
        expect(names).toHaveLength(count);
      });
    }
  });
});
