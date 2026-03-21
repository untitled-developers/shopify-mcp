import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerShopTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "get_shop_info",
    "Get basic information about the Shopify store: name, domain, email, plan, currency, timezone, and more.",
    {},
    async () => {
      const data = await client.request<{ shop: Record<string, unknown> }>("shop.json");
      return {
        content: [{ type: "text", text: JSON.stringify(data.shop, null, 2) }],
      };
    }
  );
}
