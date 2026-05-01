import { ShopifyConfig } from "./config.js";

/**
 * Returns the Shopify Admin API access token.
 *
 * If SHOPIFY_ACCESS_TOKEN is set (partner dashboard apps), it is used directly.
 * Otherwise falls back to the client_credentials OAuth grant (store-created custom apps).
 */
export async function getAccessToken(config: ShopifyConfig): Promise<string> {
  // Direct access token — no OAuth needed (partner dashboard / store custom apps)
  if (config.accessToken) {
    return config.accessToken;
  }

  // No SHOPIFY_ACCESS_TOKEN set — client_credentials grant only works for
  // store-created custom apps (admin-created). Partner Dashboard apps require
  // the authorization code grant flow. Direct the user to run the helper.
  throw new Error(
    "Authentication failed: SHOPIFY_ACCESS_TOKEN is not set.\n\n" +
    "Partner Dashboard apps cannot use the client_credentials grant.\n" +
    "Run the one-time OAuth helper to get your access token:\n\n" +
    "  node /path/to/shopify-mcp/dist/get-token.js\n\n" +
    "Then add SHOPIFY_ACCESS_TOKEN=<token> to your .env file and restart the MCP server."
  );
}
