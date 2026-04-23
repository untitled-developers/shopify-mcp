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
import { registerBundleTools } from "../src/tools/bundles.js";

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
  // collections (12)
  "list_custom_collections", "list_smart_collections", "get_custom_collection", "get_smart_collection",
  "create_custom_collection", "update_custom_collection", "delete_custom_collection",
  "update_smart_collection", "reorder_collection_products",
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
  // discounts – legacy REST (8)
  "list_price_rules", "get_price_rule", "create_price_rule", "update_price_rule", "delete_price_rule",
  "list_discount_codes", "create_discount_code", "delete_discount_code",
  // discounts – GraphQL code discounts (11)
  "list_code_discounts", "get_code_discount",
  "create_code_discount_basic", "update_code_discount_basic",
  "create_code_discount_bxgy", "update_code_discount_bxgy",
  "create_code_discount_free_shipping", "update_code_discount_free_shipping",
  "activate_code_discount", "deactivate_code_discount", "delete_code_discount",
  // discounts – GraphQL automatic discounts (11)
  "list_automatic_discounts", "get_automatic_discount",
  "create_automatic_discount_basic", "update_automatic_discount_basic",
  "create_automatic_discount_bxgy", "update_automatic_discount_bxgy",
  "create_automatic_discount_free_shipping", "update_automatic_discount_free_shipping",
  "activate_automatic_discount", "deactivate_automatic_discount", "delete_automatic_discount",
  // fulfillments (5)
  "list_fulfillment_orders", "list_fulfillments", "create_fulfillment", "update_fulfillment_tracking", "cancel_fulfillment",
  // webhooks (5)
  "list_webhooks", "get_webhook", "create_webhook", "update_webhook", "delete_webhook",
  // menus (5)
  "list_menus", "get_menu", "create_menu", "update_menu", "delete_menu",
  // files (5)
  "list_files", "create_file", "update_file", "delete_files", "stage_upload",
  // apps (2)
  "list_app_installations", "get_app_installation",
  // themes (10)
  "list_themes", "get_theme", "create_theme", "update_theme", "publish_theme", "delete_theme",
  "list_theme_files", "get_theme_files", "upsert_theme_files", "delete_theme_files",
  // pages (5)
  "list_pages", "get_page", "create_page", "update_page", "delete_page",
  // bundles (4)
  "create_bundle", "update_bundle", "get_bundle", "get_bundle_operation",
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
    registerBundleTools(server, client);
  });

  it("registers exactly 135 tools", () => {
    expect(registeredTools).toHaveLength(135);
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
      collections: 12,
      orders: 9,
      customers: 9,
      inventory: 5,
      "draft-orders": 7,
      discounts: 30,
      fulfillments: 5,
      webhooks: 5,
      menus: 5,
      files: 5,
      apps: 2,
      themes: 10,
      pages: 5,
      bundles: 4,
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
          bundles: registerBundleTools,
        };

        registerFns[group](s, c);
        expect(names).toHaveLength(count);
      });
    }
  });
});

describe("stage_upload handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    const handlers: Record<string, Function> = {};
    const orig = s.tool.bind(s);
    s.tool = ((...args: any[]) => {
      handlers[args[0]] = args[args.length - 1];
      return orig(...args);
    }) as any;
    registerFileTools(s, c);
    return { client: c, handler: handlers["stage_upload"] };
  }

  it("defaults http_method to PUT", async () => {
    const { client, handler } = buildServerWithHandler();
    const mockTarget = { url: "https://storage.example.com/upload", resourceUrl: "https://cdn.shopify.com/files/photo.jpg", parameters: [] };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      stagedUploadsCreate: { stagedTargets: [mockTarget], userErrors: [] },
    });

    await handler({ filename: "photo.jpg", mime_type: "image/jpeg", resource: "IMAGE" });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining("stagedUploadsCreate"),
      expect.objectContaining({ input: [expect.objectContaining({ httpMethod: "PUT" })] })
    );
  });

  it("forwards file_size when provided", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      stagedUploadsCreate: {
        stagedTargets: [{ url: "https://storage.example.com/upload", resourceUrl: "https://cdn.shopify.com/files/vid.mp4", parameters: [] }],
        userErrors: [],
      },
    });

    await handler({ filename: "vid.mp4", mime_type: "video/mp4", resource: "VIDEO", file_size: "1048576" });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ input: [expect.objectContaining({ fileSize: "1048576", resource: "VIDEO" })] })
    );
  });

  it("maps all input fields to camelCase mutation variables", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      stagedUploadsCreate: {
        stagedTargets: [{ url: "u", resourceUrl: "ru", parameters: [{ name: "key", value: "val" }] }],
        userErrors: [],
      },
    });

    await handler({ filename: "doc.pdf", mime_type: "application/pdf", resource: "FILE", http_method: "POST" });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: [{ filename: "doc.pdf", mimeType: "application/pdf", resource: "FILE", httpMethod: "POST" }],
      })
    );
  });

  it("returns url, resourceUrl, and parameters from the first staged target", async () => {
    const { client, handler } = buildServerWithHandler();
    const mockTarget = {
      url: "https://storage.example.com/upload",
      resourceUrl: "https://cdn.shopify.com/files/photo.jpg",
      parameters: [{ name: "Content-Type", value: "image/jpeg" }],
    };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      stagedUploadsCreate: { stagedTargets: [mockTarget], userErrors: [] },
    });

    const result = await handler({ filename: "photo.jpg", mime_type: "image/jpeg", resource: "IMAGE" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(mockTarget);
  });

  it("throws when userErrors are returned", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      stagedUploadsCreate: {
        stagedTargets: [],
        userErrors: [{ field: ["resource"], message: "is invalid" }],
      },
    });

    await expect(
      handler({ filename: "photo.jpg", mime_type: "image/jpeg", resource: "IMAGE" })
    ).rejects.toThrow("stagedUploadsCreate errors");
  });
});

describe("update_smart_collection handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    registerCollectionTools(s, c);
    const tool = (s as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => unknown }> })._registeredTools["update_smart_collection"];
    return { client: c, handler: tool.handler.bind(tool) as (args: unknown) => Promise<{ content: { text: string }[] }> };
  }

  it("sends PUT to smart_collections endpoint with only provided fields", async () => {
    const { client, handler } = buildServerWithHandler();
    const spy = vi.spyOn(client, "request").mockResolvedValueOnce({ smart_collection: { id: 42, sort_order: "best-selling" } });
    await handler({ collection_id: "42", sort_order: "best-selling" });
    expect(spy).toHaveBeenCalledWith(
      "smart_collections/42.json",
      expect.objectContaining({ method: "PUT", body: { smart_collection: { sort_order: "best-selling" } } })
    );
  });

  it("omits fields not provided", async () => {
    const { client, handler } = buildServerWithHandler();
    const spy = vi.spyOn(client, "request").mockResolvedValueOnce({ smart_collection: { id: 42 } });
    await handler({ collection_id: "42", title: "New Title" });
    expect(spy).toHaveBeenCalledWith(
      "smart_collections/42.json",
      expect.objectContaining({ body: { smart_collection: { title: "New Title" } } })
    );
  });

  it("returns the updated smart_collection data", async () => {
    const { client, handler } = buildServerWithHandler();
    const updated = { id: 42, title: "Shoes", sort_order: "manual" };
    vi.spyOn(client, "request").mockResolvedValueOnce({ smart_collection: updated });
    const result = await handler({ collection_id: "42", title: "Shoes", sort_order: "manual" });
    expect(JSON.parse(result.content[0].text)).toEqual(updated);
  });
});

describe("reorder_collection_products handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    registerCollectionTools(s, c);
    const tool = (s as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => unknown }> })._registeredTools["reorder_collection_products"];
    return { client: c, handler: tool.handler.bind(tool) as (args: unknown) => Promise<{ content: { text: string }[] }> };
  }

  it("fetches collects and assigns positions in order", async () => {
    const { client, handler } = buildServerWithHandler();
    const collects = [
      { id: 101, product_id: 1 },
      { id: 102, product_id: 2 },
      { id: 103, product_id: 3 },
    ];
    const requestSpy = vi.spyOn(client, "request")
      .mockResolvedValueOnce({ collects })
      .mockResolvedValue({});
    const result = await handler({ collection_id: "10", product_ids: ["3", "1", "2"] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reordered).toBe(3);
    expect(parsed.items[0]).toMatchObject({ product_id: "3", position: 1 });
    expect(parsed.items[1]).toMatchObject({ product_id: "1", position: 2 });
    expect(parsed.items[2]).toMatchObject({ product_id: "2", position: 3 });
    expect(requestSpy).toHaveBeenCalledTimes(4); // 1 fetch + 3 PUTs
  });

  it("throws when a product_id is not in the collection", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "request").mockResolvedValueOnce({
      collects: [{ id: 101, product_id: 1 }],
    });
    await expect(
      handler({ collection_id: "10", product_ids: ["1", "999"] })
    ).rejects.toThrow("Products not found in collection 10: 999");
  });

  it("paginates collects using since_id when first page is full", async () => {
    const { client, handler } = buildServerWithHandler();
    const page1 = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, product_id: i + 1 }));
    const page2 = [{ id: 300, product_id: 300 }];
    vi.spyOn(client, "request")
      .mockResolvedValueOnce({ collects: page1 })
      .mockResolvedValueOnce({ collects: page2 })
      .mockResolvedValue({});
    const result = await handler({ collection_id: "10", product_ids: ["300"] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reordered).toBe(1);
    expect(parsed.items[0]).toMatchObject({ product_id: "300", position: 1 });
  });
});

describe("create_bundle handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    const handlers: Record<string, Function> = {};
    const orig = s.tool.bind(s);
    s.tool = ((...args: any[]) => { handlers[args[0]] = args[args.length - 1]; return orig(...args); }) as any;
    registerBundleTools(s, c);
    return { client: c, handler: handlers["create_bundle"] };
  }

  it("calls productBundleCreate mutation and returns the operation", async () => {
    const { client, handler } = buildServerWithHandler();
    const mockOp = { id: "gid://shopify/ProductBundleOperation/1", status: "CREATED", product: null };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleCreate: { productBundleOperation: mockOp, userErrors: [] },
    });

    const result = await handler({
      title: "My Bundle",
      components: [{
        product_id: "gid://shopify/Product/1",
        quantity: 2,
        option_selections: [{ component_option_id: "gid://shopify/ProductOption/1", name: "Color", values: ["Red"] }],
      }],
    });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining("productBundleCreate"),
      expect.objectContaining({
        input: expect.objectContaining({
          title: "My Bundle",
          components: [expect.objectContaining({ productId: "gid://shopify/Product/1", quantity: 2 })],
        }),
      })
    );
    expect(JSON.parse(result.content[0].text)).toEqual(mockOp);
  });

  it("maps option_selections fields to camelCase", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleCreate: { productBundleOperation: { id: "op1", status: "CREATED", product: null }, userErrors: [] },
    });

    await handler({
      title: "Bundle",
      components: [{
        product_id: "gid://shopify/Product/1",
        option_selections: [{ component_option_id: "gid://shopify/ProductOption/9", name: "Size", values: ["S", "M"] }],
      }],
    });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({
          components: [expect.objectContaining({
            optionSelections: [{ componentOptionId: "gid://shopify/ProductOption/9", name: "Size", values: ["S", "M"] }],
          })],
        }),
      })
    );
  });

  it("throws when userErrors are returned", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleCreate: { productBundleOperation: null, userErrors: [{ field: ["title"], message: "is blank" }] },
    });

    await expect(
      handler({ title: "", components: [{ product_id: "gid://shopify/Product/1", option_selections: [] }] })
    ).rejects.toThrow("productBundleCreate errors: is blank");
  });
});

describe("update_bundle handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    const handlers: Record<string, Function> = {};
    const orig = s.tool.bind(s);
    s.tool = ((...args: any[]) => { handlers[args[0]] = args[args.length - 1]; return orig(...args); }) as any;
    registerBundleTools(s, c);
    return { client: c, handler: handlers["update_bundle"] };
  }

  it("sends productId and only provided optional fields", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleUpdate: { productBundleOperation: { id: "op2", status: "CREATED", product: null }, userErrors: [] },
    });

    await handler({ product_id: "gid://shopify/Product/5", title: "New Name" });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining("productBundleUpdate"),
      expect.objectContaining({ input: { productId: "gid://shopify/Product/5", title: "New Name" } })
    );
  });

  it("omits components key when not provided", async () => {
    const { client, handler } = buildServerWithHandler();
    const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleUpdate: { productBundleOperation: { id: "op3", status: "CREATED", product: null }, userErrors: [] },
    });

    await handler({ product_id: "gid://shopify/Product/5" });

    const callInput = (spy.mock.calls[0][1] as any).input;
    expect(callInput).not.toHaveProperty("components");
  });

  it("throws when userErrors are returned", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleUpdate: { productBundleOperation: null, userErrors: [{ field: ["productId"], message: "not found" }] },
    });

    await expect(
      handler({ product_id: "gid://shopify/Product/999" })
    ).rejects.toThrow("productBundleUpdate errors: not found");
  });
});

describe("get_bundle_operation handler", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServerWithHandler() {
    const s = new McpServer({ name: "handler-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    const handlers: Record<string, Function> = {};
    const orig = s.tool.bind(s);
    s.tool = ((...args: any[]) => { handlers[args[0]] = args[args.length - 1]; return orig(...args); }) as any;
    registerBundleTools(s, c);
    return { client: c, handler: handlers["get_bundle_operation"] };
  }

  it("queries productOperation with the provided ID and returns result", async () => {
    const { client, handler } = buildServerWithHandler();
    const mockResult = {
      id: "gid://shopify/ProductBundleOperation/42",
      status: "COMPLETE",
      product: { id: "gid://shopify/Product/7", title: "My Bundle", status: "ACTIVE" },
      userErrors: [],
    };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({ productOperation: mockResult });

    const result = await handler({ operation_id: "gid://shopify/ProductBundleOperation/42" });

    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining("productOperation"),
      { id: "gid://shopify/ProductBundleOperation/42" }
    );
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });

  it("returns null when operation is not found", async () => {
    const { client, handler } = buildServerWithHandler();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({ productOperation: null });

    const result = await handler({ operation_id: "gid://shopify/ProductBundleOperation/999" });
    expect(JSON.parse(result.content[0].text)).toBeNull();
  });
});

describe("bundle handler tests", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  function buildServer() {
    const s = new McpServer({ name: "bundle-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    registerBundleTools(s, c);
    const tools = (s as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => unknown }> })._registeredTools;
    return {
      client: c,
      createHandler: tools["create_bundle"].handler.bind(tools["create_bundle"]) as (a: unknown) => Promise<{ content: { text: string }[] }>,
      updateHandler: tools["update_bundle"].handler.bind(tools["update_bundle"]) as (a: unknown) => Promise<{ content: { text: string }[] }>,
      pollHandler: tools["get_bundle_operation"].handler.bind(tools["get_bundle_operation"]) as (a: unknown) => Promise<{ content: { text: string }[] }>,
    };
  }

  const sampleComponent = {
    product_id: "gid://shopify/Product/1",
    quantity: 2,
    option_selections: [{ component_option_id: "gid://shopify/ProductOption/10", name: "Color", values: ["Red"] }],
  };

  it("create_bundle calls graphql with correct input and returns operation", async () => {
    const { client, createHandler } = buildServer();
    const operation = { id: "gid://shopify/ProductBundleOperation/1", status: "CREATED", product: null };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleCreate: { productBundleOperation: operation, userErrors: [] },
    });

    const result = await createHandler({ title: "Starter Kit", components: [sampleComponent] });

    expect(JSON.parse(result.content[0].text)).toEqual(operation);
  });

  it("create_bundle throws on userErrors", async () => {
    const { client, createHandler } = buildServer();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleCreate: { productBundleOperation: null, userErrors: [{ field: ["title"], message: "can't be blank" }] },
    });

    await expect(
      createHandler({ title: "", components: [sampleComponent] })
    ).rejects.toThrow("productBundleCreate errors: can't be blank");
  });

  it("update_bundle sends productId and only provided fields", async () => {
    const { client, updateHandler } = buildServer();
    const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleUpdate: { productBundleOperation: { id: "gid://shopify/ProductBundleOperation/2", status: "CREATED", product: null }, userErrors: [] },
    });

    await updateHandler({ product_id: "gid://shopify/Product/42", title: "New Name" });

    const callArgs = spy.mock.calls[0][1] as { input: Record<string, unknown> };
    expect(callArgs.input).toMatchObject({ productId: "gid://shopify/Product/42", title: "New Name" });
    expect(callArgs.input.components).toBeUndefined();
  });

  it("update_bundle throws on userErrors", async () => {
    const { client, updateHandler } = buildServer();
    vi.spyOn(client, "graphql").mockResolvedValueOnce({
      productBundleUpdate: { productBundleOperation: null, userErrors: [{ field: ["productId"], message: "not found" }] },
    });

    await expect(
      updateHandler({ product_id: "gid://shopify/Product/999" })
    ).rejects.toThrow("productBundleUpdate errors: not found");
  });

  it("get_bundle_operation returns the operation data", async () => {
    const { client, pollHandler } = buildServer();
    const operation = {
      id: "gid://shopify/ProductBundleOperation/1",
      status: "COMPLETE",
      product: { id: "gid://shopify/Product/100", title: "Starter Kit", status: "DRAFT" },
      userErrors: [],
    };
    vi.spyOn(client, "graphql").mockResolvedValueOnce({ productOperation: operation });

    const result = await pollHandler({ operation_id: "gid://shopify/ProductBundleOperation/1" });

    expect(JSON.parse(result.content[0].text)).toEqual(operation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BXGY discount handler tests
// ─────────────────────────────────────────────────────────────────────────────
describe("BXGY discount handler tests", () => {
  const testConfig = {
    storeName: "test-store",
    clientId: "test-id",
    clientSecret: "test-secret",
    apiVersion: "2026-01",
  };

  type HandlerFn = (a: unknown) => Promise<{ content: { text: string }[] }>;

  function buildServer() {
    const s = new McpServer({ name: "bxgy-test", version: "0.0.0" });
    const c = new ShopifyClient(testConfig);
    registerDiscountTools(s, c);
    const tools = (s as unknown as { _registeredTools: Record<string, { handler: HandlerFn }> })._registeredTools;
    function h(name: string): HandlerFn {
      return tools[name].handler.bind(tools[name]);
    }
    return {
      client: c,
      createCode: h("create_code_discount_bxgy"),
      updateCode: h("update_code_discount_bxgy"),
      createAuto: h("create_automatic_discount_bxgy"),
      updateAuto: h("update_automatic_discount_bxgy"),
    };
  }

  const NODE_ID = "gid://shopify/DiscountCodeNode/1";
  const AUTO_NODE_ID = "gid://shopify/DiscountAutomaticNode/1";
  const PRODUCT_ID = "gid://shopify/Product/100";
  const COLLECTION_ID = "gid://shopify/Collection/200";

  const codeNode = { id: NODE_ID, codeDiscount: { title: "BXGY", status: "ACTIVE" } };
  const autoNode = { id: AUTO_NODE_ID, automaticDiscount: { title: "BXGY Auto", status: "ACTIVE" } };

  // ─── create_code_discount_bxgy ─────────────────────────────────────────────

  describe("create_code_discount_bxgy", () => {
    it("buy all / get all / free — sends all:true and percentage:1.0", async () => {
      const { client, createCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await createCode({
        title: "Buy 3 Get 1 Free",
        code: "B3G1",
        startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "3",
        getQuantity: "1",
        getDiscountType: "free",
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ all: true });
      expect((input.customerGets as { items: unknown }).items).toEqual({ all: true });
      expect(
        ((input.customerGets as { value: { discountOnQuantity: { effect: unknown } } }).value.discountOnQuantity.effect)
      ).toEqual({ percentage: 1.0 });
    });

    it("buy specific products / get specific products / percentage 20%", async () => {
      const { client, createCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await createCode({
        title: "Buy 2 Get 1 20% Off",
        code: "B2G1",
        startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "2",
        buyProductIds: [PRODUCT_ID],
        getQuantity: "1",
        getProductIds: [PRODUCT_ID],
        getDiscountType: "percentage",
        getDiscountPercentage: 20,
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ products: { productsToAdd: [PRODUCT_ID] } });
      expect((input.customerGets as { items: unknown }).items).toEqual({ products: { productsToAdd: [PRODUCT_ID] } });
      expect(
        ((input.customerGets as { value: { discountOnQuantity: { effect: unknown } } }).value.discountOnQuantity.effect)
      ).toEqual({ percentage: 0.2 });
    });

    it("buy collection / get collection", async () => {
      const { client, createCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await createCode({
        title: "Collection BXGY",
        code: "COLBXGY",
        startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "2",
        buyCollectionIds: [COLLECTION_ID],
        getQuantity: "1",
        getCollectionIds: [COLLECTION_ID],
        getDiscountType: "free",
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ collections: { add: [COLLECTION_ID] } });
      expect((input.customerGets as { items: unknown }).items).toEqual({ collections: { add: [COLLECTION_ID] } });
    });

    it("includes optional fields: endsAt, appliesOncePerCustomer, usesPerOrderLimit, combinesWith", async () => {
      const { client, createCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await createCode({
        title: "Limited BXGY",
        code: "LIM",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-12-31T23:59:59Z",
        appliesOncePerCustomer: true,
        usesPerOrderLimit: 1,
        buyQuantity: "2",
        getQuantity: "1",
        getDiscountType: "free",
        combinesWith: { shippingDiscounts: true },
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.endsAt).toBe("2026-12-31T23:59:59Z");
      expect(input.appliesOncePerCustomer).toBe(true);
      expect(input.usesPerOrderLimit).toBe("1");
      expect(input.combinesWith).toEqual({ orderDiscounts: false, productDiscounts: false, shippingDiscounts: true });
    });

    it("returns parsed codeDiscountNode on success", async () => {
      const { client, createCode } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      const result = await createCode({
        title: "T", code: "C", startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "1", getQuantity: "1", getDiscountType: "free",
      });

      expect(JSON.parse(result.content[0].text)).toEqual(codeNode);
    });

    it("throws on userErrors", async () => {
      const { client, createCode } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyCreate: { codeDiscountNode: null, userErrors: [{ field: ["code"], message: "already taken" }] },
      });

      await expect(
        createCode({ title: "T", code: "DUP", startsAt: "2026-01-01T00:00:00Z", buyQuantity: "1", getQuantity: "1", getDiscountType: "free" })
      ).rejects.toThrow("already taken");
    });
  });

  // ─── update_code_discount_bxgy ─────────────────────────────────────────────

  describe("update_code_discount_bxgy", () => {
    it("updates title only — no customerBuys/customerGets in input", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, title: "New Title" });

      const input = (spy.mock.calls[0][1] as { id: string; input: Record<string, unknown> }).input;
      expect(input.title).toBe("New Title");
      expect(input.customerBuys).toBeUndefined();
      expect(input.customerGets).toBeUndefined();
    });

    it("updates customerBuys when buyQuantity is provided with specific products", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, buyQuantity: "5", buyProductIds: [PRODUCT_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerBuys).toMatchObject({ value: { quantity: "5" }, items: { products: { productsToAdd: [PRODUCT_ID] } } });
      expect(input.customerGets).toBeUndefined();
    });

    it("does NOT update customerBuys when buyQuantity is missing", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, buyProductIds: [PRODUCT_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerBuys).toBeUndefined();
    });

    it("updates customerGets (percentage) when getQuantity + getDiscountType provided", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, getQuantity: "2", getDiscountType: "percentage", getDiscountPercentage: 50, getProductIds: [PRODUCT_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const gets = input.customerGets as { items: unknown; value: { discountOnQuantity: { effect: unknown } } };
      expect(gets.value.discountOnQuantity.effect).toEqual({ percentage: 0.5 });
      expect(gets.items).toEqual({ products: { productsToAdd: [PRODUCT_ID] } });
    });

    it("updates customerGets (free) — effect is percentage:1.0", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, getQuantity: "1", getDiscountType: "free" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const gets = input.customerGets as { value: { discountOnQuantity: { effect: unknown } } };
      expect(gets.value.discountOnQuantity.effect).toEqual({ percentage: 1.0 });
    });

    it("does NOT update customerGets when only getQuantity provided without getDiscountType", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, getQuantity: "1" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerGets).toBeUndefined();
    });

    it("passes the id correctly as a separate variable", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, title: "Renamed" });

      const vars = spy.mock.calls[0][1] as { id: string; input: unknown };
      expect(vars.id).toBe(NODE_ID);
    });

    it("includes combinesWith when provided", async () => {
      const { client, updateCode } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: codeNode, userErrors: [] },
      });

      await updateCode({ id: NODE_ID, combinesWith: { productDiscounts: true } });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.combinesWith).toEqual({ orderDiscounts: false, productDiscounts: true, shippingDiscounts: false });
    });

    it("throws on userErrors", async () => {
      const { client, updateCode } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountCodeBxgyUpdate: { codeDiscountNode: null, userErrors: [{ field: ["id"], message: "not found" }] },
      });

      await expect(updateCode({ id: "gid://shopify/DiscountCodeNode/999" })).rejects.toThrow("not found");
    });
  });

  // ─── create_automatic_discount_bxgy ───────────────────────────────────────

  describe("create_automatic_discount_bxgy", () => {
    it("buy all / get all / free — minimal required fields", async () => {
      const { client, createAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await createAuto({ title: "Auto B3G1", startsAt: "2026-01-01T00:00:00Z", buyQuantity: "3", getQuantity: "1", getDiscountType: "free" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ all: true });
      expect((input.customerGets as { items: unknown }).items).toEqual({ all: true });
      expect(
        ((input.customerGets as { value: { discountOnQuantity: { effect: unknown } } }).value.discountOnQuantity.effect)
      ).toEqual({ percentage: 1.0 });
    });

    it("buy specific products / get specific products / percentage 30%", async () => {
      const { client, createAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await createAuto({
        title: "Auto 30% Off",
        startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "2",
        buyProductIds: [PRODUCT_ID],
        getQuantity: "1",
        getProductIds: [PRODUCT_ID],
        getDiscountType: "percentage",
        getDiscountPercentage: 30,
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ products: { productsToAdd: [PRODUCT_ID] } });
      expect(
        ((input.customerGets as { value: { discountOnQuantity: { effect: unknown } } }).value.discountOnQuantity.effect)
      ).toEqual({ percentage: 0.3 });
    });

    it("buy collection / get collection", async () => {
      const { client, createAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await createAuto({
        title: "Collection Auto BXGY",
        startsAt: "2026-01-01T00:00:00Z",
        buyQuantity: "2",
        buyCollectionIds: [COLLECTION_ID],
        getQuantity: "1",
        getCollectionIds: [COLLECTION_ID],
        getDiscountType: "free",
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect((input.customerBuys as { items: unknown }).items).toEqual({ collections: { add: [COLLECTION_ID] } });
      expect((input.customerGets as { items: unknown }).items).toEqual({ collections: { add: [COLLECTION_ID] } });
    });

    it("includes optional fields: endsAt, usesPerOrderLimit, combinesWith", async () => {
      const { client, createAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await createAuto({
        title: "Auto Limited",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-06-30T23:59:59Z",
        usesPerOrderLimit: 2,
        buyQuantity: "3",
        getQuantity: "1",
        getDiscountType: "free",
        combinesWith: { orderDiscounts: true },
      });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.endsAt).toBe("2026-06-30T23:59:59Z");
      expect(input.usesPerOrderLimit).toBe("2");
      expect(input.combinesWith).toEqual({ orderDiscounts: true, productDiscounts: false, shippingDiscounts: false });
    });

    it("returns parsed automaticDiscountNode on success", async () => {
      const { client, createAuto } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      const result = await createAuto({ title: "T", startsAt: "2026-01-01T00:00:00Z", buyQuantity: "1", getQuantity: "1", getDiscountType: "free" });

      expect(JSON.parse(result.content[0].text)).toEqual(autoNode);
    });

    it("throws on userErrors", async () => {
      const { client, createAuto } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyCreate: { automaticDiscountNode: null, userErrors: [{ field: ["title"], message: "can't be blank" }] },
      });

      await expect(
        createAuto({ title: "", startsAt: "2026-01-01T00:00:00Z", buyQuantity: "1", getQuantity: "1", getDiscountType: "free" })
      ).rejects.toThrow("can't be blank");
    });
  });

  // ─── update_automatic_discount_bxgy ───────────────────────────────────────

  describe("update_automatic_discount_bxgy", () => {
    it("updates title only — no customerBuys/customerGets", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, title: "Renamed" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.title).toBe("Renamed");
      expect(input.customerBuys).toBeUndefined();
      expect(input.customerGets).toBeUndefined();
    });

    it("updates customerBuys when buyQuantity provided with collections", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, buyQuantity: "4", buyCollectionIds: [COLLECTION_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerBuys).toMatchObject({ value: { quantity: "4" }, items: { collections: { add: [COLLECTION_ID] } } });
      expect(input.customerGets).toBeUndefined();
    });

    it("does NOT update customerBuys when buyQuantity is missing", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, buyCollectionIds: [COLLECTION_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerBuys).toBeUndefined();
    });

    it("updates customerGets (free) — effect percentage:1.0", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, getQuantity: "1", getDiscountType: "free" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const gets = input.customerGets as { value: { discountOnQuantity: { effect: unknown } } };
      expect(gets.value.discountOnQuantity.effect).toEqual({ percentage: 1.0 });
    });

    it("updates customerGets (percentage) — effect divided by 100", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, getQuantity: "2", getDiscountType: "percentage", getDiscountPercentage: 25, getProductIds: [PRODUCT_ID] });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const gets = input.customerGets as { items: unknown; value: { discountOnQuantity: { effect: unknown } } };
      expect(gets.value.discountOnQuantity.effect).toEqual({ percentage: 0.25 });
      expect(gets.items).toEqual({ products: { productsToAdd: [PRODUCT_ID] } });
    });

    it("does NOT update customerGets when getDiscountType is missing", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, getQuantity: "1" });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.customerGets).toBeUndefined();
    });

    it("passes the id correctly as a separate variable", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, title: "X" });

      const vars = spy.mock.calls[0][1] as { id: string; input: unknown };
      expect(vars.id).toBe(AUTO_NODE_ID);
    });

    it("includes combinesWith when provided", async () => {
      const { client, updateAuto } = buildServer();
      const spy = vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: autoNode, userErrors: [] },
      });

      await updateAuto({ id: AUTO_NODE_ID, combinesWith: { productDiscounts: true, shippingDiscounts: true } });

      const input = (spy.mock.calls[0][1] as { input: Record<string, unknown> }).input as Record<string, unknown>;
      expect(input.combinesWith).toEqual({ orderDiscounts: false, productDiscounts: true, shippingDiscounts: true });
    });

    it("throws on userErrors", async () => {
      const { client, updateAuto } = buildServer();
      vi.spyOn(client, "graphql").mockResolvedValueOnce({
        discountAutomaticBxgyUpdate: { automaticDiscountNode: null, userErrors: [{ field: ["id"], message: "not found" }] },
      });

      await expect(updateAuto({ id: "gid://shopify/DiscountAutomaticNode/999" })).rejects.toThrow("not found");
    });
  });
});
