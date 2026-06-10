#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ShopifyClient } from "./shopify-client.js";
import { registerShopTools } from "./tools/shop.js";
import { registerProductTools } from "./tools/products.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerVariantTools } from "./tools/variants.js";
import { registerDraftOrderTools } from "./tools/draft-orders.js";
import { registerDiscountTools } from "./tools/discounts.js";
import { registerFulfillmentTools } from "./tools/fulfillments.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerImageTools } from "./tools/images.js";
import { registerMenuTools } from "./tools/menus.js";
import { registerFileTools } from "./tools/files.js";
import { registerAppTools } from "./tools/apps.js";
import { registerThemeTools } from "./tools/themes.js";
import { registerPageTools } from "./tools/pages.js";
import { registerBundleTools } from "./tools/bundles.js";

async function main() {
  const config = loadConfig();
  const client = new ShopifyClient(config);

  const server = new McpServer({
    name: "kockatoos-shopify-mcp",
    version: "1.0.0",
  });

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

  // Connect via stdio (standard MCP transport)
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting Shopify MCP server:", err);
  process.exit(1);
});
