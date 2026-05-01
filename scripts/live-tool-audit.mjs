import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { loadConfig } from "../dist/config.js";
import { ShopifyClient } from "../dist/shopify-client.js";
import { registerShopTools } from "../dist/tools/shop.js";
import { registerProductTools } from "../dist/tools/products.js";
import { registerOrderTools } from "../dist/tools/orders.js";
import { registerCustomerTools } from "../dist/tools/customers.js";
import { registerInventoryTools } from "../dist/tools/inventory.js";
import { registerCollectionTools } from "../dist/tools/collections.js";
import { registerVariantTools } from "../dist/tools/variants.js";
import { registerDraftOrderTools } from "../dist/tools/draft-orders.js";
import { registerDiscountTools } from "../dist/tools/discounts.js";
import { registerFulfillmentTools } from "../dist/tools/fulfillments.js";
import { registerWebhookTools } from "../dist/tools/webhooks.js";
import { registerImageTools } from "../dist/tools/images.js";
import { registerMenuTools } from "../dist/tools/menus.js";
import { registerFileTools } from "../dist/tools/files.js";
import { registerAppTools } from "../dist/tools/apps.js";
import { registerThemeTools } from "../dist/tools/themes.js";
import { registerPageTools } from "../dist/tools/pages.js";
import { registerBundleTools } from "../dist/tools/bundles.js";

const REPORT_DIR = path.resolve("docs", "reports");
const IMAGE_URL = "https://picsum.photos/seed/kockatoos-shopify-mcp/640/480.jpg";
const THEME_ZIP_URL = "https://codeload.github.com/Shopify/dawn/zip/refs/heads/main";

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeMessage(value) {
  return String(value ?? "")
    .replace(/shp(?:at|ca|ss|ua|us)?_[A-Za-z0-9]+/g, "[REDACTED_TOKEN]")
    .replace(/gid:\/\/shopify\/([^/]+)\/([A-Za-z0-9-]+)/g, "gid://shopify/$1/[id]")
    .trim();
}

function parseText(result) {
  if (!result || !Array.isArray(result.content)) return "";
  return result.content
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function maybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function lastSegment(id) {
  if (!id || typeof id !== "string") return "";
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

function makeHandle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 255);
}

function describeJson(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === "object") return `object(${Object.keys(value).slice(0, 5).join(", ")})`;
  return JSON.stringify(value);
}

function flattenMenuItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    out.push(item);
    if (Array.isArray(item.items)) out.push(...flattenMenuItems(item.items));
  }
  return out;
}

async function main() {
  const config = loadConfig();
  const client = new ShopifyClient(config);

  const runAt = new Date();
  const runDate = runAt.toISOString().slice(0, 10);
  const runTag = `copilot-tool-audit-${runAt.toISOString().replace(/[.:]/g, "-")}`;
  const reportBase = `live-tool-audit-${runDate}`;
  const markdownPath = path.join(REPORT_DIR, `${reportBase}.md`);
  const jsonPath = path.join(REPORT_DIR, `${reportBase}.json`);

  await fs.mkdir(REPORT_DIR, { recursive: true });

  const registry = new Map();
  const server = new McpServer({ name: "tool-audit", version: "0.0.0" });
  server.tool = ((name, description, schema, handler) => {
    registry.set(name, { description, schema, handler });
    return server;
  });

  [
    registerShopTools,
    registerProductTools,
    registerOrderTools,
    registerCustomerTools,
    registerInventoryTools,
    registerCollectionTools,
    registerVariantTools,
    registerDraftOrderTools,
    registerDiscountTools,
    registerFulfillmentTools,
    registerWebhookTools,
    registerImageTools,
    registerMenuTools,
    registerFileTools,
    registerAppTools,
    registerThemeTools,
    registerPageTools,
    registerBundleTools,
  ].forEach((register) => register(server, client));

  const results = [];
  const cleanup = [];
  const cleanupResults = [];
  const state = {
    anchors: {},
    temp: {},
  };

  function addResult(tool, status, summary, details = "") {
    results.push({
      tool,
      status,
      summary,
      details: sanitizeMessage(details),
    });
  }

  function manual(tool, reason) {
    addResult(tool, "manual", reason);
  }

  function enqueueCleanup(label, fn) {
    cleanup.push({ label, fn });
  }

  async function runTool(name, args = {}) {
    const entry = registry.get(name);
    if (!entry) throw new Error(`Tool not registered: ${name}`);
    const parsed = z.object(entry.schema).parse(args);
    const raw = await entry.handler(parsed);
    const text = parseText(raw);
    return { raw, text, json: maybeJson(text) };
  }

  async function attempt(name, args, summaryBuilder, options = {}) {
    try {
      const output = await runTool(name, args);
      addResult(name, "success", summaryBuilder ? summaryBuilder(output) : "invoked successfully", options.details ?? "");
      return output;
    } catch (error) {
      addResult(name, "failed", options.failureSummary ?? "tool invocation failed", error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async function retryUntil(name, argsFactory, predicate, attempts = 12, delayMs = 2500) {
    let lastOutput = null;
    let lastError = null;
    for (let index = 0; index < attempts; index += 1) {
      try {
        lastOutput = await runTool(name, typeof argsFactory === "function" ? argsFactory() : argsFactory);
        if (predicate(lastOutput)) return lastOutput;
      } catch (error) {
        lastError = error;
      }
      if (index < attempts - 1) await sleep(delayMs);
    }
    if (lastError) throw lastError;
    return lastOutput;
  }

  async function graphql(query, variables) {
    return client.graphql(query, variables);
  }

  async function cleanupCustomer(id) {
    const data = await graphql(
      `mutation CustomerDelete($id: ID!) {
        customerDelete(input: {id: $id}) {
          deletedCustomerId
          userErrors { field message }
        }
      }`,
      { id }
    );
    const errors = data.customerDelete?.userErrors ?? [];
    if (errors.length) throw new Error(JSON.stringify(errors));
  }

  async function cleanupMetafieldDefinition(id) {
    const data = await graphql(
      `mutation DeleteMetafieldDefinition($id: ID!, $deleteAllAssociatedMetafields: Boolean!) {
        metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: $deleteAllAssociatedMetafields) {
          deletedDefinitionId
          userErrors { field message code }
        }
      }`,
      { id, deleteAllAssociatedMetafields: true }
    );
    const errors = data.metafieldDefinitionDelete?.userErrors ?? [];
    if (errors.length) throw new Error(JSON.stringify(errors));
  }

  async function createHelperVariant(productId) {
    if (!state.anchors.locationId) {
      throw new Error("Missing location ID for helper variant creation");
    }
    const data = await graphql(
      `mutation CreateHelperVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            title
            inventoryItem { id }
          }
          userErrors { field message }
        }
      }`,
      {
        productId,
        variants: [
          {
            optionValues: [{ name: "Audit Variant", optionName: "Title" }],
            price: "12.34",
            taxable: false,
            inventoryItem: { sku: makeHandle(`${runTag}-helper-sku`).toUpperCase() },
            inventoryQuantities: [{ availableQuantity: 5, locationId: state.anchors.locationId }],
          },
        ],
      }
    );
    const errors = data.productVariantsBulkCreate?.userErrors ?? [];
    if (errors.length) throw new Error(JSON.stringify(errors));
    return data.productVariantsBulkCreate?.productVariants?.[0] ?? null;
  }

  try {
    const shopInfo = await attempt("get_shop_info", {}, () => "retrieved shop metadata");
    if (shopInfo?.json) state.anchors.shop = shopInfo.json;

    const locations = await attempt("list_locations", {}, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} location(s)`);
    const firstLocation = Array.isArray(locations?.json) ? locations.json[0] : null;
    if (firstLocation?.id) {
      state.anchors.locationId = firstLocation.id;
      await attempt("get_location", { location_id: firstLocation.id }, () => `retrieved location ${lastSegment(firstLocation.id)}`);
    } else {
      manual("get_location", "no location available in store");
    }

    const apps = await attempt("list_app_installations", { limit: 5 }, (output) => `returned ${output.json?.nodes?.length ?? 0} installation(s)`);
    const firstAppInstallation = apps?.json?.nodes?.[0] ?? null;
    if (firstAppInstallation?.id) {
      await attempt("get_app_installation", { installation_id: firstAppInstallation.id }, () => "retrieved one app installation");
    } else {
      addResult("get_app_installation", "failed", "prerequisite app installation id was not available");
    }

    const listOrders = await attempt("list_orders", { limit: 5, status: "any" }, (output) => `returned ${output.json?.orders?.length ?? 0} order(s)`);
    const firstOrder = listOrders?.json?.orders?.[0] ?? null;
    if (firstOrder?.id) {
      state.anchors.orderId = firstOrder.id;
      await attempt("get_order", { order_id: firstOrder.id }, () => "retrieved one existing order");
      await attempt("list_order_metafields", { order_id: firstOrder.id, limit: 10 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} order metafield(s)`);
      await attempt("get_order_metafield", { order_id: firstOrder.id, namespace: runTag, key: "missing" }, () => "queried a non-existent order metafield and handled null response");
      await attempt("list_fulfillment_orders", { order_id: firstOrder.id }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} fulfillment order(s)`);
      await attempt("list_fulfillments", { order_id: firstOrder.id, limit: 10 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} fulfillment(s)`);
    } else {
      manual("get_order", "no existing order available to read safely");
      manual("list_order_metafields", "no existing order available to read safely");
      manual("get_order_metafield", "no existing order available to read safely");
      manual("list_fulfillment_orders", "no existing order available to read safely");
      manual("list_fulfillments", "no existing order available to read safely");
    }

    manual("update_order", "would modify an existing order or require creation of a non-deletable order");
    manual("close_order", "would modify an existing order or require creation of a non-deletable order");
    manual("cancel_order", "would modify an existing order irreversibly");
    manual("set_order_metafield", "requires a persistent order record to be created or modified");
    manual("delete_order_metafield", "requires modifying an order-bound metafield on a persistent order record");
    manual("create_fulfillment", "requires shipping a real order");
    manual("update_fulfillment_tracking", "requires modifying fulfillment state on a real order");
    manual("cancel_fulfillment", "requires modifying fulfillment state on a real order");

    const productTitle = `${runTag} product`;
    const product = await attempt(
      "create_product",
      { title: productTitle, status: "draft", tags: runTag },
      (output) => `created draft product ${lastSegment(output.json?.id)}`,
      { failureSummary: "failed to create temporary product" }
    );
    if (product?.json?.id) {
      state.temp.productId = product.json.id;
      enqueueCleanup("delete temp product", async () => {
        await runTool("delete_product", { product_id: state.temp.productId });
      });
      await attempt("get_product", { product_id: state.temp.productId }, () => "retrieved temporary product");
      await attempt("list_products", { limit: 10, title: productTitle }, (output) => `returned ${output.json?.products?.length ?? 0} matching product(s)`);
      await attempt("update_product", { product_id: state.temp.productId, tags: `${runTag},updated` }, () => "updated temporary product tags");
      await attempt("list_product_metafields", { product_id: state.temp.productId, namespace: runTag, limit: 10 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} product metafield(s)`);

      const productMetafield = await attempt(
        "set_product_metafield",
        { product_id: state.temp.productId, namespace: runTag, key: "note", value: "tool-audit", type: "single_line_text_field" },
        (output) => `upserted product metafield ${lastSegment(output.json?.[0]?.id)}`
      );
      if (productMetafield?.json?.[0]?.id) {
        state.temp.productMetafieldId = productMetafield.json[0].id;
        await attempt("get_product_metafield", { product_id: state.temp.productId, namespace: runTag, key: "note" }, () => "retrieved temporary product metafield");
        await attempt("list_product_metafields", { product_id: state.temp.productId, namespace: runTag, limit: 10 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} product metafield(s) after create`);
        await attempt("delete_product_metafield", { metafield_id: state.temp.productMetafieldId }, () => "deleted temporary product metafield");
        state.temp.productMetafieldId = null;
      } else {
        addResult("get_product_metafield", "failed", "prerequisite metafield was not created");
        addResult("delete_product_metafield", "failed", "prerequisite metafield was not created");
      }

      const metafieldDefinition = await attempt(
        "create_metafield_definition",
        {
          name: `${runTag} product note`,
          namespace: runTag,
          key: "definition_note",
          type: "single_line_text_field",
          owner_type: "PRODUCT",
        },
        (output) => `created metafield definition ${lastSegment(output.json?.id)}`
      );
      if (metafieldDefinition?.json?.id) {
        state.temp.metafieldDefinitionId = metafieldDefinition.json.id;
        enqueueCleanup("delete temp metafield definition", async () => {
          if (state.temp.metafieldDefinitionId) {
            await cleanupMetafieldDefinition(state.temp.metafieldDefinitionId);
          }
        });
        await attempt("list_metafield_definitions", { namespace: runTag }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} definition(s) in namespace`);
      } else {
        await attempt("list_metafield_definitions", { namespace: runTag }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} definition(s) in namespace`);
      }

      await attempt("list_product_images", { product_id: state.temp.productId, limit: 10 }, (output) => `returned ${output.json?.images?.length ?? 0} product media item(s)`);
      const image = await attempt(
        "create_product_image",
        { product_id: state.temp.productId, src: IMAGE_URL, alt: runTag },
        (output) => `created product image ${lastSegment(output.json?.id)}`
      );
      if (image?.json?.id) {
        state.temp.imageId = image.json.id;
        const readyImage = await retryUntil(
          "get_product_image",
          () => ({ product_id: state.temp.productId, image_id: state.temp.imageId }),
          (output) => output?.json?.status === "READY",
          15,
          2000
        ).catch(() => null);
        if (readyImage) {
          addResult("get_product_image", "success", `retrieved product image with status ${readyImage.json?.status ?? "unknown"}`);
          await attempt("update_product_image", { product_id: state.temp.productId, image_id: state.temp.imageId, alt: `${runTag} updated` }, () => "updated temporary product image alt text");
          await attempt("delete_product_image", { product_id: state.temp.productId, image_id: state.temp.imageId }, () => "deleted temporary product image");
          state.temp.imageId = null;
        } else {
          addResult("get_product_image", "failed", "failed to observe temporary product image state");
          addResult("update_product_image", "failed", "temporary product image never became queryable");
          addResult("delete_product_image", "failed", "temporary product image never became queryable");
        }
      } else {
        addResult("get_product_image", "failed", "prerequisite image was not created");
        addResult("update_product_image", "failed", "prerequisite image was not created");
        addResult("delete_product_image", "failed", "prerequisite image was not created");
      }
    } else {
      [
        "get_product",
        "update_product",
        "delete_product",
        "list_product_metafields",
        "get_product_metafield",
        "set_product_metafield",
        "delete_product_metafield",
        "create_metafield_definition",
        "list_metafield_definitions",
        "list_product_images",
        "get_product_image",
        "create_product_image",
        "update_product_image",
        "delete_product_image",
      ].forEach((tool) => addResult(tool, "failed", "temporary product prerequisite was not created"));
    }

    const helperProduct = await attempt(
      "create_product",
      { title: `${runTag} helper`, status: "draft", tags: `${runTag},helper` },
      (output) => `created helper product ${lastSegment(output.json?.id)}`
    );
    if (helperProduct?.json?.id) {
      state.temp.helperProductId = helperProduct.json.id;
      enqueueCleanup("delete helper product", async () => {
        if (state.temp.helperProductId) await runTool("delete_product", { product_id: state.temp.helperProductId });
      });
    }

    if (state.temp.productId) {
      if (state.anchors.locationId) {
        await attempt("list_inventory_levels", { location_id: state.anchors.locationId, limit: 10 }, (output) => `returned ${output.json?.inventory_levels?.length ?? 0} inventory level(s)`);
      } else {
        addResult("list_inventory_levels", "failed", "missing location prerequisite");
      }
      await attempt("list_variants", { product_id: state.temp.productId, limit: 10 }, (output) => `returned ${output.json?.variants?.length ?? 0} variant(s)`);
      const createdVariant = await attempt(
        "create_variant",
        {
          product_id: state.temp.productId,
          option1: "Audit Variant",
          sku: makeHandle(`${runTag}-sku`).toUpperCase(),
          price: "12.34",
          inventory_quantity: 5,
          taxable: false,
        },
        (output) => `created variant ${lastSegment(output.json?.id)}`
      );
      let variantId = createdVariant?.json?.id ?? null;
      let inventoryItemId = createdVariant?.json?.inventoryItem?.id ?? null;
      if (!variantId) {
        const helperVariant = await createHelperVariant(state.temp.productId).catch((error) => {
          addResult("get_variant", "failed", "failed to create alternate helper variant for dependent tests", error instanceof Error ? error.message : String(error));
          addResult("update_variant", "failed", "failed to create alternate helper variant for dependent tests");
          addResult("delete_variant", "failed", "failed to create alternate helper variant for dependent tests");
          addResult("set_inventory", "failed", "failed to create alternate helper variant for dependent tests");
          addResult("adjust_inventory", "failed", "failed to create alternate helper variant for dependent tests");
          return null;
        });
        variantId = helperVariant?.id ?? null;
        inventoryItemId = helperVariant?.inventoryItem?.id ?? null;
      }
      if (variantId) {
        state.temp.variantId = variantId;
        state.temp.inventoryItemId = inventoryItemId;
        enqueueCleanup("delete temp variant", async () => {
          if (state.temp.variantId && state.temp.productId) {
            await runTool("delete_variant", { product_id: state.temp.productId, variant_id: state.temp.variantId });
          }
        });
        await attempt("get_variant", { variant_id: state.temp.variantId }, () => "retrieved temporary variant");
        await attempt("update_variant", { variant_id: state.temp.variantId, price: "15.67", taxable: true }, () => "updated temporary variant");
        if (state.anchors.locationId && state.temp.inventoryItemId) {
          await attempt("set_inventory", { inventory_item_id: state.temp.inventoryItemId, location_id: state.anchors.locationId, available: 5 }, () => "set temporary inventory level to 5");
          await attempt("adjust_inventory", { inventory_item_id: state.temp.inventoryItemId, location_id: state.anchors.locationId, adjustment: -2 }, () => "adjusted temporary inventory level by -2");
        } else {
          addResult("set_inventory", "failed", "missing location or inventory item prerequisite");
          addResult("adjust_inventory", "failed", "missing location or inventory item prerequisite");
        }
        await attempt("delete_variant", { product_id: state.temp.productId, variant_id: state.temp.variantId }, () => "deleted temporary variant");
        state.temp.variantId = null;
      } else {
        ["get_variant", "update_variant", "delete_variant", "set_inventory", "adjust_inventory"].forEach((tool) => {
          addResult(tool, "failed", "temporary variant prerequisite was not created");
        });
      }
    } else {
      ["list_variants", "create_variant", "get_variant", "update_variant", "delete_variant", "list_inventory_levels", "set_inventory", "adjust_inventory"].forEach((tool) => {
        addResult(tool, "failed", "temporary product prerequisite was not created");
      });
    }

    const customerEmail = `${makeHandle(runTag)}@example.com`;
    await attempt("list_customers", { limit: 10 }, (output) => `returned ${output.json?.customers?.length ?? 0} customer(s)`);
    const customer = await attempt(
      "create_customer",
      { email: customerEmail, first_name: "Tool", last_name: "Audit", tags: runTag, note: runTag },
      (output) => `created customer ${lastSegment(output.json?.id)}`
    );
    if (customer?.json?.id) {
      state.temp.customerId = customer.json.id;
      enqueueCleanup("delete temp customer", async () => {
        if (state.temp.customerId) await cleanupCustomer(state.temp.customerId);
      });
      await attempt("search_customers", { query: `email:${customerEmail}`, limit: 5 }, (output) => `returned ${output.json?.customers?.length ?? 0} matching customer(s)`);
      await attempt("get_customer", { customer_id: state.temp.customerId }, () => "retrieved temporary customer");
      await attempt("update_customer", { customer_id: state.temp.customerId, note: `${runTag} updated` }, () => "updated temporary customer note");
      await attempt("list_customer_metafields", { customer_id: state.temp.customerId, namespace: runTag, limit: 10 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} customer metafield(s)`);
      const customerMetafield = await attempt(
        "set_customer_metafield",
        { customer_id: state.temp.customerId, namespace: runTag, key: "status", value: "ok", type: "single_line_text_field" },
        (output) => `upserted customer metafield ${lastSegment(output.json?.[0]?.id)}`
      );
      if (customerMetafield?.json?.[0]?.id) {
        state.temp.customerMetafieldId = customerMetafield.json[0].id;
        await attempt("get_customer_metafield", { customer_id: state.temp.customerId, namespace: runTag, key: "status" }, () => "retrieved temporary customer metafield");
        await attempt("delete_customer_metafield", { metafield_id: state.temp.customerMetafieldId }, () => "deleted temporary customer metafield");
        state.temp.customerMetafieldId = null;
      } else {
        addResult("get_customer_metafield", "failed", "prerequisite customer metafield was not created");
        addResult("delete_customer_metafield", "failed", "prerequisite customer metafield was not created");
      }
    } else {
      ["search_customers", "get_customer", "update_customer", "list_customer_metafields", "get_customer_metafield", "set_customer_metafield", "delete_customer_metafield"].forEach((tool) => {
        addResult(tool, "failed", "temporary customer prerequisite was not created");
      });
    }

    if (state.temp.productId) {
      const customCollection = await attempt(
        "create_custom_collection",
        {
          title: `${runTag} custom collection`,
          sort_order: "manual",
          collects: state.temp.helperProductId ? [{ product_id: state.temp.productId }, { product_id: state.temp.helperProductId }] : [{ product_id: state.temp.productId }],
        },
        (output) => `created custom collection ${lastSegment(output.json?.id)}`
      );
      if (customCollection?.json?.id) {
        state.temp.customCollectionId = customCollection.json.id;
        enqueueCleanup("delete temp custom collection", async () => {
          if (state.temp.customCollectionId) {
            await runTool("delete_custom_collection", { collection_id: state.temp.customCollectionId });
          }
        });
        await attempt("list_custom_collections", { limit: 20, title: `${runTag} custom collection` }, (output) => `returned ${output.json?.custom_collections?.length ?? 0} custom collection(s)`);
        await attempt("get_custom_collection", { collection_id: state.temp.customCollectionId }, () => "retrieved temporary custom collection");
        await attempt("list_collection_products", { collection_id: state.temp.customCollectionId, limit: 20 }, (output) => `returned ${output.json?.products?.length ?? 0} collection product(s)`);
        await attempt("update_custom_collection", { collection_id: state.temp.customCollectionId, title: `${runTag} custom collection updated` }, () => "updated temporary custom collection title");
        if (state.temp.helperProductId) {
          await attempt("remove_product_from_collection", { collection_id: state.temp.customCollectionId, product_id: state.temp.helperProductId }, () => "removed helper product from custom collection");
          await attempt("add_product_to_collection", { collection_id: state.temp.customCollectionId, product_id: state.temp.helperProductId }, () => "added helper product back to custom collection");
          await attempt(
            "reorder_collection_products",
            { collection_id: state.temp.customCollectionId, product_ids: [state.temp.helperProductId, state.temp.productId] },
            () => "reordered products in custom collection"
          );
        } else {
          addResult("remove_product_from_collection", "failed", "helper product prerequisite was not created");
          addResult("add_product_to_collection", "failed", "helper product prerequisite was not created");
          addResult("reorder_collection_products", "failed", "helper product prerequisite was not created");
        }
        await attempt("delete_custom_collection", { collection_id: state.temp.customCollectionId }, () => "deleted temporary custom collection");
        state.temp.customCollectionId = null;
      } else {
        ["list_custom_collections", "get_custom_collection", "update_custom_collection", "delete_custom_collection", "add_product_to_collection", "remove_product_from_collection", "reorder_collection_products", "list_collection_products"].forEach((tool) => {
          addResult(tool, "failed", "temporary custom collection prerequisite was not created");
        });
      }

      const smartCollection = await attempt(
        "create_smart_collection",
        {
          title: `${runTag} smart collection`,
          rules: [{ column: "tag", relation: "equals", condition: runTag }],
        },
        (output) => `created smart collection ${lastSegment(output.json?.id)}`
      );
      if (smartCollection?.json?.id) {
        state.temp.smartCollectionId = smartCollection.json.id;
        enqueueCleanup("delete temp smart collection", async () => {
          if (state.temp.smartCollectionId) {
            await runTool("delete_custom_collection", { collection_id: state.temp.smartCollectionId });
          }
        });
        await attempt("list_smart_collections", { limit: 20, title: `${runTag} smart collection` }, (output) => `returned ${output.json?.smart_collections?.length ?? 0} smart collection(s)`);
        await attempt("get_smart_collection", { collection_id: state.temp.smartCollectionId }, () => "retrieved temporary smart collection");
        await attempt("update_smart_collection", { collection_id: state.temp.smartCollectionId, title: `${runTag} smart collection updated` }, () => "updated temporary smart collection title");
      } else {
        ["list_smart_collections", "get_smart_collection", "update_smart_collection"].forEach((tool) => {
          addResult(tool, "failed", "temporary smart collection prerequisite was not created");
        });
      }
    } else {
      ["create_custom_collection", "list_custom_collections", "get_custom_collection", "update_custom_collection", "delete_custom_collection", "create_smart_collection", "list_smart_collections", "get_smart_collection", "update_smart_collection", "reorder_collection_products", "add_product_to_collection", "remove_product_from_collection", "list_collection_products"].forEach((tool) => {
        addResult(tool, "failed", "temporary product prerequisite was not created" );
      });
    }

    if (state.temp.productId) {
      await attempt("list_draft_orders", { limit: 10 }, (output) => `returned ${output.json?.draft_orders?.length ?? 0} draft order(s)`);
      const draftOrder = await attempt(
        "create_draft_order",
        { line_items: [{ title: `${runTag} custom item`, price: "9.99", quantity: 1 }], email: customerEmail, note: runTag },
        (output) => `created draft order ${lastSegment(output.json?.id)}`
      );
      if (draftOrder?.json?.id) {
        state.temp.draftOrderId = draftOrder.json.id;
        enqueueCleanup("delete temp draft order", async () => {
          if (state.temp.draftOrderId) await runTool("delete_draft_order", { draft_order_id: state.temp.draftOrderId });
        });
        await attempt("get_draft_order", { draft_order_id: state.temp.draftOrderId }, () => "retrieved temporary draft order");
        await attempt("update_draft_order", { draft_order_id: state.temp.draftOrderId, note: `${runTag} updated` }, () => "updated temporary draft order");
        manual("complete_draft_order", "would create a persistent order record that cannot be fully cleaned automatically");
        manual("send_draft_order_invoice", "would send an outbound email");
        await attempt("delete_draft_order", { draft_order_id: state.temp.draftOrderId }, () => "deleted temporary draft order");
        state.temp.draftOrderId = null;
      } else {
        ["get_draft_order", "update_draft_order", "delete_draft_order"].forEach((tool) => addResult(tool, "failed", "temporary draft order prerequisite was not created"));
        manual("complete_draft_order", "temporary draft order was not available and successful completion would leave persistent data");
        manual("send_draft_order_invoice", "temporary draft order was not available and successful invocation would send email");
      }
    } else {
      ["list_draft_orders", "create_draft_order", "get_draft_order", "update_draft_order", "delete_draft_order"].forEach((tool) => addResult(tool, "failed", "temporary product prerequisite was not created"));
      manual("complete_draft_order", "requires a temporary draft order and leaves persistent order data");
      manual("send_draft_order_invoice", "requires a temporary draft order and sends email");
    }

    await attempt("list_pages", { limit: 20, query: `title:${makeHandle(runTag)}` }, (output) => `returned ${output.json?.nodes?.length ?? 0} page(s)`);
    const page = await attempt(
      "create_page",
      { title: `${runTag} page`, body: `<p>${runTag}</p>`, handle: makeHandle(`${runTag}-page`), is_published: false },
      (output) => `created page ${lastSegment(output.json?.page?.id)}`
    );
    const pageId = page?.json?.page?.id ?? null;
    if (pageId) {
      state.temp.pageId = pageId;
      enqueueCleanup("delete temp page", async () => {
        if (state.temp.pageId) await runTool("delete_page", { page_id: state.temp.pageId });
      });
      await attempt("get_page", { page_id: state.temp.pageId }, () => "retrieved temporary page");
      await attempt("update_page", { page_id: state.temp.pageId, title: `${runTag} page updated` }, () => "updated temporary page");
      await attempt("delete_page", { page_id: state.temp.pageId }, () => "deleted temporary page");
      state.temp.pageId = null;
    } else {
      ["get_page", "update_page", "delete_page"].forEach((tool) => addResult(tool, "failed", "temporary page prerequisite was not created"));
    }

    await attempt("list_webhooks", { limit: 20, topic: "products/update" }, (output) => `returned ${output.json?.webhooks?.length ?? 0} webhook(s)`);
    const webhook = await attempt(
      "create_webhook",
      { topic: "products/update", address: "https://example.com/webhooks/tool-audit", format: "json" },
      (output) => `created webhook ${lastSegment(output.json?.id)}`
    );
    if (webhook?.json?.id) {
      state.temp.webhookId = webhook.json.id;
      enqueueCleanup("delete temp webhook", async () => {
        if (state.temp.webhookId) await runTool("delete_webhook", { webhook_id: state.temp.webhookId });
      });
      await attempt("get_webhook", { webhook_id: state.temp.webhookId }, () => "retrieved temporary webhook");
      await attempt("update_webhook", { webhook_id: state.temp.webhookId, address: "https://example.com/webhooks/tool-audit-updated" }, () => "updated temporary webhook address");
      await attempt("delete_webhook", { webhook_id: state.temp.webhookId }, () => "deleted temporary webhook");
      state.temp.webhookId = null;
    } else {
      ["get_webhook", "update_webhook", "delete_webhook"].forEach((tool) => addResult(tool, "failed", "temporary webhook prerequisite was not created"));
    }

    await attempt("list_menus", { limit: 20 }, (output) => `returned ${Array.isArray(output.json) ? output.json.length : 0} menu(s)`);
    const menuHandle = makeHandle(`${runTag}-menu`);
    const menu = await attempt(
      "create_menu",
      {
        title: `${runTag} menu`,
        handle: menuHandle,
        items: [{ title: "Audit Link", url: "https://example.com/audit", type: "HTTP" }],
      },
      (output) => `created menu ${lastSegment(output.json?.id)}`
    );
    if (menu?.json?.id) {
      state.temp.menuId = menu.json.id;
      enqueueCleanup("delete temp menu", async () => {
        if (state.temp.menuId) await runTool("delete_menu", { id: state.temp.menuId });
      });
      await attempt("get_menu", { handle: menuHandle }, () => "retrieved temporary menu by handle");
      const flattened = flattenMenuItems(menu.json?.items ?? []);
      const firstItemId = flattened[0]?.id;
      await attempt(
        "update_menu",
        {
          id: state.temp.menuId,
          title: `${runTag} menu updated`,
          items: [{ id: firstItemId, title: "Audit Link Updated", url: "https://example.com/audit-updated", type: "HTTP" }],
        },
        () => "updated temporary menu"
      );
      await attempt("delete_menu", { id: state.temp.menuId }, () => "deleted temporary menu");
      state.temp.menuId = null;
    } else {
      ["get_menu", "update_menu", "delete_menu"].forEach((tool) => addResult(tool, "failed", "temporary menu prerequisite was not created"));
    }

    await attempt("list_files", { limit: 20 }, (output) => `returned ${output.json?.nodes?.length ?? 0} file(s)`);
    await attempt("stage_upload", { filename: `${makeHandle(runTag)}.jpg`, mime_type: "image/jpeg", resource: "IMAGE" }, () => "received staged upload target");
    const file = await attempt(
      "create_file",
      { original_source: IMAGE_URL, alt: runTag, content_type: "IMAGE" },
      (output) => `created file ${lastSegment(output.json?.[0]?.id)}`
    );
    if (file?.json?.[0]?.id) {
      state.temp.fileId = file.json[0].id;
      enqueueCleanup("delete temp file", async () => {
        if (state.temp.fileId) await runTool("delete_files", { file_ids: [state.temp.fileId] });
      });
      const updatedFile = await retryUntil(
        "update_file",
        () => ({ id: state.temp.fileId, alt: `${runTag} updated` }),
        (output) => Array.isArray(output?.json) && output.json.length > 0,
        12,
        2500
      ).catch((error) => {
        addResult("update_file", "failed", "failed to update temporary file after retries", error instanceof Error ? error.message : String(error));
        return null;
      });
      if (updatedFile) addResult("update_file", "success", "updated temporary file alt text");
      await attempt("delete_files", { file_ids: [state.temp.fileId] }, () => "deleted temporary file");
      state.temp.fileId = null;
    } else {
      ["update_file", "delete_files"].forEach((tool) => addResult(tool, "failed", "temporary file prerequisite was not created"));
    }

    await attempt("list_themes", { limit: 20 }, (output) => `returned ${output.json?.nodes?.length ?? 0} theme(s)`);
    const themes = await runTool("list_themes", { limit: 20 }).catch(() => null);
    const firstTheme = themes?.json?.nodes?.[0] ?? null;
    if (firstTheme?.id) {
      await attempt("get_theme", { theme_id: firstTheme.id }, () => "retrieved one existing theme");
      await attempt("list_theme_files", { theme_id: firstTheme.id, limit: 10 }, (output) => `returned ${output.json?.nodes?.length ?? 0} theme file(s)`);
      await attempt("get_theme_files", { theme_id: firstTheme.id, filenames: ["layout/theme.liquid"] }, () => "retrieved a known theme file from an existing theme");
    } else {
      manual("get_theme", "no existing theme returned by list_themes");
      manual("list_theme_files", "no existing theme returned by list_themes");
      manual("get_theme_files", "no existing theme returned by list_themes");
    }

    const theme = await attempt(
      "create_theme",
      { source: THEME_ZIP_URL, name: `${runTag} theme`, role: "UNPUBLISHED" },
      (output) => `created theme ${lastSegment(output.json?.id)}`
    );
    if (theme?.json?.id) {
      state.temp.themeId = theme.json.id;
      enqueueCleanup("delete temp theme", async () => {
        if (state.temp.themeId) await runTool("delete_theme", { theme_id: state.temp.themeId });
      });
      const readyTheme = await retryUntil(
        "get_theme",
        () => ({ theme_id: state.temp.themeId }),
        (output) => output?.json?.processing === false,
        30,
        4000
      ).catch((error) => {
        addResult("get_theme", "failed", "temporary theme never finished processing", error instanceof Error ? error.message : String(error));
        return null;
      });
      if (readyTheme) {
        addResult("get_theme", "success", "retrieved temporary theme after processing completed");
        await attempt("update_theme", { theme_id: state.temp.themeId, name: `${runTag} theme updated` }, () => "updated temporary theme name");
        await attempt(
          "upsert_theme_files",
          { theme_id: state.temp.themeId, files: [{ filename: "assets/tool-audit.css", body: { type: "text", content: `/* ${runTag} */\nbody { outline: 0; }\n` } }] },
          () => "upserted a temporary theme file"
        );
        await attempt("delete_theme_files", { theme_id: state.temp.themeId, filenames: ["assets/tool-audit.css"] }, () => "deleted temporary theme file");
        await attempt("delete_theme", { theme_id: state.temp.themeId }, () => "deleted temporary theme");
        state.temp.themeId = null;
      } else {
        ["update_theme", "upsert_theme_files", "delete_theme_files", "delete_theme"].forEach((tool) => addResult(tool, "failed", "temporary theme never finished processing"));
      }
    } else {
      ["update_theme", "delete_theme", "upsert_theme_files", "delete_theme_files"].forEach((tool) => addResult(tool, "failed", "temporary theme prerequisite was not created"));
    }
    manual("publish_theme", "would change the live storefront theme");

    await attempt("list_price_rules", { limit: 10 }, (output) => `returned ${output.json?.price_rules?.length ?? 0} compatibility discount node(s)`);
    const futureStart = iso(24 * 60 * 60 * 1000);
    const laterEnd = iso(72 * 60 * 60 * 1000);
    const priceRule = await attempt(
      "create_price_rule",
      {
        title: `${runTag} legacy code discount`,
        target_type: "line_item",
        target_selection: "all",
        allocation_method: "across",
        value_type: "percentage",
        value: "-5.0",
        customer_selection: "all",
        starts_at: futureStart,
        ends_at: laterEnd,
        once_per_customer: true,
      },
      (output) => `created compatibility code discount ${lastSegment(output.json?.id)}`
    );
    if (priceRule?.json?.id) {
      state.temp.priceRuleId = priceRule.json.id;
      enqueueCleanup("delete temp compatibility discount", async () => {
        if (state.temp.priceRuleId) await runTool("delete_price_rule", { price_rule_id: state.temp.priceRuleId });
      });
      await attempt("get_price_rule", { price_rule_id: state.temp.priceRuleId }, () => "retrieved compatibility code discount");
      await attempt("update_price_rule", { price_rule_id: state.temp.priceRuleId, title: `${runTag} legacy code discount updated` }, () => "updated compatibility code discount");
      await attempt("list_discount_codes", { price_rule_id: state.temp.priceRuleId, limit: 10 }, (output) => `returned ${output.json?.discount_codes?.length ?? 0} redeem code(s)`);
      const updatedLegacy = await attempt(
        "create_discount_code",
        { price_rule_id: state.temp.priceRuleId, code: makeHandle(`${runTag}-code`).toUpperCase() },
        () => "updated compatibility discount redeem code"
      );
      const legacyCodeId = updatedLegacy?.json?.codeDiscount?.codes?.nodes?.[0]?.id ?? updatedLegacy?.json?.discount?.codes?.nodes?.[0]?.id ?? null;
      if (legacyCodeId) {
        await attempt("delete_discount_code", { price_rule_id: state.temp.priceRuleId, discount_code_id: legacyCodeId }, () => "deleted compatibility discount redeem code");
      } else {
        addResult("delete_discount_code", "failed", "redeem code id was not returned after create_discount_code");
      }
      await attempt("delete_price_rule", { price_rule_id: state.temp.priceRuleId }, () => "deleted compatibility code discount");
      state.temp.priceRuleId = null;
    } else {
      ["get_price_rule", "update_price_rule", "list_discount_codes", "create_discount_code", "delete_discount_code", "delete_price_rule"].forEach((tool) => addResult(tool, "failed", "compatibility discount prerequisite was not created"));
    }

    await attempt("list_code_discounts", { limit: 10, query: runTag }, (output) => `returned ${output.json?.nodes?.length ?? 0} code discount node(s)`);

    const codeBasic = await attempt(
      "create_code_discount_basic",
      {
        title: `${runTag} code basic`,
        code: makeHandle(`${runTag}-basic`).toUpperCase(),
        startsAt: futureStart,
        endsAt: laterEnd,
        discountType: "percentage",
        discountValue: 10,
        appliesToAll: false,
        productIds: state.temp.productId ? [state.temp.productId] : undefined,
      },
      (output) => `created basic code discount ${lastSegment(output.json?.id)}`
    );
    if (codeBasic?.json?.id) {
      state.temp.codeBasicId = codeBasic.json.id;
      enqueueCleanup("delete temp basic code discount", async () => {
        if (state.temp.codeBasicId) await runTool("delete_code_discount", { id: state.temp.codeBasicId });
      });
      await attempt("get_code_discount", { id: state.temp.codeBasicId }, () => "retrieved basic code discount by id");
      await attempt("update_code_discount_basic", { id: state.temp.codeBasicId, title: `${runTag} code basic updated` }, () => "updated basic code discount");
      await attempt("activate_code_discount", { id: state.temp.codeBasicId }, () => "activated basic code discount");
      await attempt("deactivate_code_discount", { id: state.temp.codeBasicId }, () => "deactivated basic code discount");
    } else {
      ["get_code_discount", "update_code_discount_basic", "activate_code_discount", "deactivate_code_discount", "delete_code_discount"].forEach((tool) => addResult(tool, "failed", "basic code discount prerequisite was not created"));
    }

    const codeBxgy = await attempt(
      "create_code_discount_bxgy",
      {
        title: `${runTag} code bxgy`,
        code: makeHandle(`${runTag}-bxgy`).toUpperCase(),
        startsAt: futureStart,
        buyQuantity: "1",
        buyProductIds: state.temp.productId ? [state.temp.productId] : undefined,
        getQuantity: "1",
        getDiscountType: "percentage",
        getDiscountPercentage: 50,
        getProductIds: state.temp.productId ? [state.temp.productId] : undefined,
      },
      (output) => `created BXGY code discount ${lastSegment(output.json?.id)}`
    );
    if (codeBxgy?.json?.id) {
      state.temp.codeBxgyId = codeBxgy.json.id;
      enqueueCleanup("delete temp BXGY code discount", async () => {
        if (state.temp.codeBxgyId) await runTool("delete_code_discount", { id: state.temp.codeBxgyId });
      });
      await attempt("update_code_discount_bxgy", { id: state.temp.codeBxgyId, title: `${runTag} code bxgy updated` }, () => "updated BXGY code discount");
      await attempt("delete_code_discount", { id: state.temp.codeBxgyId }, () => "deleted BXGY code discount");
      state.temp.codeBxgyId = null;
    } else {
      ["update_code_discount_bxgy"].forEach((tool) => addResult(tool, "failed", "BXGY code discount prerequisite was not created"));
    }

    const codeFreeShipping = await attempt(
      "create_code_discount_free_shipping",
      {
        title: `${runTag} code free shipping`,
        code: makeHandle(`${runTag}-ship`).toUpperCase(),
        startsAt: futureStart,
        minimumSubtotal: 999999,
      },
      (output) => `created free shipping code discount ${lastSegment(output.json?.id)}`
    );
    if (codeFreeShipping?.json?.id) {
      state.temp.codeFreeShippingId = codeFreeShipping.json.id;
      enqueueCleanup("delete temp free shipping code discount", async () => {
        if (state.temp.codeFreeShippingId) await runTool("delete_code_discount", { id: state.temp.codeFreeShippingId });
      });
      await attempt("update_code_discount_free_shipping", { id: state.temp.codeFreeShippingId, title: `${runTag} code free shipping updated` }, () => "updated free shipping code discount");
      await attempt("delete_code_discount", { id: state.temp.codeFreeShippingId }, () => "deleted free shipping code discount");
      state.temp.codeFreeShippingId = null;
    } else {
      addResult("update_code_discount_free_shipping", "failed", "free shipping code discount prerequisite was not created");
    }

    await attempt("list_automatic_discounts", { limit: 10, query: runTag }, (output) => `returned ${output.json?.nodes?.length ?? 0} automatic discount node(s)`);

    const autoBasic = await attempt(
      "create_automatic_discount_basic",
      {
        title: `${runTag} automatic basic`,
        startsAt: futureStart,
        discountType: "percentage",
        discountValue: 10,
        appliesToAll: false,
        productIds: state.temp.productId ? [state.temp.productId] : undefined,
      },
      (output) => `created basic automatic discount ${lastSegment(output.json?.id)}`
    );
    if (autoBasic?.json?.id) {
      state.temp.autoBasicId = autoBasic.json.id;
      enqueueCleanup("delete temp basic automatic discount", async () => {
        if (state.temp.autoBasicId) await runTool("delete_automatic_discount", { id: state.temp.autoBasicId });
      });
      await attempt("get_automatic_discount", { id: state.temp.autoBasicId }, () => "retrieved basic automatic discount");
      await attempt("update_automatic_discount_basic", { id: state.temp.autoBasicId, title: `${runTag} automatic basic updated` }, () => "updated basic automatic discount");
      await attempt("activate_automatic_discount", { id: state.temp.autoBasicId }, () => "activated basic automatic discount");
      await attempt("deactivate_automatic_discount", { id: state.temp.autoBasicId }, () => "deactivated basic automatic discount");
    } else {
      ["get_automatic_discount", "update_automatic_discount_basic", "activate_automatic_discount", "deactivate_automatic_discount", "delete_automatic_discount"].forEach((tool) => addResult(tool, "failed", "basic automatic discount prerequisite was not created"));
    }

    const autoBxgy = await attempt(
      "create_automatic_discount_bxgy",
      {
        title: `${runTag} automatic bxgy`,
        startsAt: futureStart,
        buyQuantity: "1",
        buyProductIds: state.temp.productId ? [state.temp.productId] : undefined,
        getQuantity: "1",
        getDiscountType: "percentage",
        getDiscountPercentage: 50,
        getProductIds: state.temp.productId ? [state.temp.productId] : undefined,
      },
      (output) => `created BXGY automatic discount ${lastSegment(output.json?.id)}`
    );
    if (autoBxgy?.json?.id) {
      state.temp.autoBxgyId = autoBxgy.json.id;
      enqueueCleanup("delete temp BXGY automatic discount", async () => {
        if (state.temp.autoBxgyId) await runTool("delete_automatic_discount", { id: state.temp.autoBxgyId });
      });
      await attempt("update_automatic_discount_bxgy", { id: state.temp.autoBxgyId, title: `${runTag} automatic bxgy updated` }, () => "updated BXGY automatic discount");
      await attempt("delete_automatic_discount", { id: state.temp.autoBxgyId }, () => "deleted BXGY automatic discount");
      state.temp.autoBxgyId = null;
    } else {
      addResult("update_automatic_discount_bxgy", "failed", "BXGY automatic discount prerequisite was not created");
    }

    const autoFreeShipping = await attempt(
      "create_automatic_discount_free_shipping",
      { title: `${runTag} automatic free shipping`, startsAt: futureStart, minimumSubtotal: 999999 },
      (output) => `created automatic free shipping discount ${lastSegment(output.json?.id)}`
    );
    if (autoFreeShipping?.json?.id) {
      state.temp.autoFreeShippingId = autoFreeShipping.json.id;
      enqueueCleanup("delete temp automatic free shipping discount", async () => {
        if (state.temp.autoFreeShippingId) await runTool("delete_automatic_discount", { id: state.temp.autoFreeShippingId });
      });
      await attempt("update_automatic_discount_free_shipping", { id: state.temp.autoFreeShippingId, title: `${runTag} automatic free shipping updated` }, () => "updated automatic free shipping discount");
      await attempt("delete_automatic_discount", { id: state.temp.autoFreeShippingId }, () => "deleted automatic free shipping discount");
      state.temp.autoFreeShippingId = null;
    } else {
      addResult("update_automatic_discount_free_shipping", "failed", "automatic free shipping discount prerequisite was not created");
    }

    if (state.temp.productId) {
      const component = await attempt("get_product", { product_id: state.temp.productId }, () => "loaded component product for bundle testing");
      const componentOption = component?.json?.options?.[0];
      if (component?.json?.id && componentOption?.id) {
        const bundle = await attempt(
          "create_bundle",
          {
            title: `${runTag} bundle`,
            components: [{ product_id: component.json.id, quantity: 1, option_selections: [{ component_option_id: componentOption.id, name: componentOption.name ?? "Title", values: componentOption.values ?? ["Default Title"] }] }],
          },
          (output) => `started bundle operation ${lastSegment(output.json?.id)}`
        );
        if (bundle?.json?.id) {
          state.temp.bundleOperationId = bundle.json.id;
          const finishedBundle = await retryUntil(
            "get_bundle_operation",
            () => ({ operation_id: state.temp.bundleOperationId }),
            (output) => output?.json?.status === "COMPLETE",
            20,
            4000
          ).catch((error) => {
            addResult("get_bundle_operation", "failed", "bundle operation did not complete", error instanceof Error ? error.message : String(error));
            return null;
          });
          if (finishedBundle?.json?.product?.id) {
            state.temp.bundleProductId = finishedBundle.json.product.id;
            enqueueCleanup("delete temp bundle product", async () => {
              if (state.temp.bundleProductId) await runTool("delete_product", { product_id: state.temp.bundleProductId });
            });
            addResult("get_bundle_operation", "success", "bundle operation reached COMPLETE status");
            await attempt("get_bundle", { product_id: state.temp.bundleProductId }, () => "retrieved created bundle product");
            const updatedBundle = await attempt("update_bundle", { product_id: state.temp.bundleProductId, title: `${runTag} bundle updated` }, (output) => `started bundle update operation ${lastSegment(output.json?.id)}`);
            if (updatedBundle?.json?.id) {
              await retryUntil(
                "get_bundle_operation",
                () => ({ operation_id: updatedBundle.json.id }),
                (output) => output?.json?.status === "COMPLETE",
                20,
                4000
              ).then(() => {
                addResult("get_bundle_operation", "success", "bundle update operation reached COMPLETE status");
              }).catch((error) => {
                addResult("get_bundle_operation", "failed", "bundle update operation did not complete", error instanceof Error ? error.message : String(error));
              });
            } else {
              addResult("update_bundle", "failed", "bundle update operation was not created");
            }
          } else {
            addResult("get_bundle", "failed", "bundle product id was not returned when operation completed");
            addResult("update_bundle", "failed", "bundle product id was not returned when operation completed");
          }
        } else {
          ["get_bundle_operation", "get_bundle", "update_bundle"].forEach((tool) => addResult(tool, "failed", "bundle creation prerequisite was not created"));
        }
      } else {
        ["create_bundle", "get_bundle_operation", "get_bundle", "update_bundle"].forEach((tool) => addResult(tool, "failed", "component product did not expose bundle-compatible options"));
      }
    } else {
      ["create_bundle", "get_bundle_operation", "get_bundle", "update_bundle"].forEach((tool) => addResult(tool, "failed", "temporary product prerequisite was not created"));
    }
  } finally {
    for (let index = cleanup.length - 1; index >= 0; index -= 1) {
      const task = cleanup[index];
      try {
        await task.fn();
        cleanupResults.push({ label: task.label, status: "success" });
      } catch (error) {
        cleanupResults.push({ label: task.label, status: "failed", details: sanitizeMessage(error instanceof Error ? error.message : String(error)) });
      }
    }

    const grouped = {
      success: results.filter((item) => item.status === "success"),
      failed: results.filter((item) => item.status === "failed"),
      manual: results.filter((item) => item.status === "manual"),
    };

    const markdown = [
      "# Kockatoos Shopify MCP Live Tool Audit",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Store: ${config.storeName}`,
      `Run tag: ${runTag}`,
      "",
      "## Summary",
      "",
      `- Successful tool runs: ${grouped.success.length}`,
      `- Failed tool runs: ${grouped.failed.length}`,
      `- Needs manual action: ${grouped.manual.length}`,
      `- Cleanup tasks: ${cleanupResults.length}`,
      "",
      "## Successful",
      "",
      "| Tool | Summary | Details |",
      "|------|---------|---------|",
      ...grouped.success.map((item) => `| ${item.tool} | ${item.summary} | ${item.details || ""} |`),
      "",
      "## Failed",
      "",
      "| Tool | Summary | Details |",
      "|------|---------|---------|",
      ...grouped.failed.map((item) => `| ${item.tool} | ${item.summary} | ${item.details || ""} |`),
      "",
      "## Needs Manual Action",
      "",
      "| Tool | Reason |",
      "|------|--------|",
      ...grouped.manual.map((item) => `| ${item.tool} | ${item.summary} |`),
      "",
      "## Cleanup",
      "",
      "| Task | Status | Details |",
      "|------|--------|---------|",
      ...cleanupResults.map((item) => `| ${item.label} | ${item.status} | ${item.details || ""} |`),
      "",
    ].join("\n");

    const report = {
      generatedAt: new Date().toISOString(),
      store: config.storeName,
      runTag,
      summary: {
        success: grouped.success.length,
        failed: grouped.failed.length,
        manual: grouped.manual.length,
        cleanup: cleanupResults.length,
      },
      results,
      cleanupResults,
    };

    await fs.writeFile(markdownPath, markdown, "utf8");
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

    console.log(JSON.stringify({ markdownPath, jsonPath, summary: report.summary }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});