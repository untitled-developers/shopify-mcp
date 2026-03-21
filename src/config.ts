import dotenv from "dotenv";
import path from "path";

// Load .env from the package directory (not CWD, since MCP servers are
// launched from arbitrary locations by the host agent).
// Suppress dotenv logging — stdout is reserved for MCP JSON-RPC.
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

export interface ShopifyConfig {
  storeName: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}

export function loadConfig(): ShopifyConfig {
  const storeName = process.env.SHOPIFY_STORE_NAME;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-01";

  if (!storeName || !clientId || !clientSecret) {
    throw new Error(
      "Missing required environment variables. Set SHOPIFY_STORE_NAME, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET."
    );
  }

  return { storeName, clientId, clientSecret, apiVersion };
}
