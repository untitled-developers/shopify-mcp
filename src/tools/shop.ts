import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerShopTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "get_shop_info",
    "Get basic information about the Shopify store: name, domain, email, plan, currency, timezone, and more.",
    {},
    async () => {
      const query = `
        query GetShopInfo {
          shop {
            name
            myshopifyDomain
            primaryDomain { url host }
            email
            plan { publicDisplayName partnerDevelopment }
            currencyCode
            timezoneAbbreviation
            ianaTimezone
          }
        }
      `;
      const data = await client.graphql<{ shop: Record<string, unknown> }>(query);
      return {
        content: [{ type: "text", text: JSON.stringify(data.shop, null, 2) }],
      };
    }
  );
}
