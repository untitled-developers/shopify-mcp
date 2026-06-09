import dotenv from "dotenv";
import path from "path";

// Load .env from CWD first (the directory the MCP host is running from),
// then fall back to the package directory. stdout is reserved for MCP
// JSON-RPC so dotenv logging is suppressed.
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

export interface ShopifyConfig {
  storeName: string;
  // Direct access token (partner dashboard apps / store custom apps)
  accessToken?: string;
  // OAuth client credentials (store-created custom apps)
  clientId?: string;
  clientSecret?: string;
  apiVersion: string;
}

/**
 * Normalizes a store identifier to the bare subdomain. Accepts "my-store",
 * "my-store.myshopify.com", or a full URL, and validates the result so it
 * can be safely interpolated into https://<storeName>.myshopify.com URLs.
 */
export function normalizeStoreName(raw: string): string {
  const storeName = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.myshopify\.com.*$/i, "")
    .replace(/\/.*$/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(storeName)) {
    throw new Error(
      `Invalid SHOPIFY_STORE_NAME: "${raw}". Use the store subdomain only, ` +
      `e.g. "my-store" for my-store.myshopify.com.`
    );
  }
  return storeName;
}

export function loadConfig(): ShopifyConfig {
  const rawStoreName = process.env.SHOPIFY_STORE_NAME;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-01";

  if (!rawStoreName) {
    throw new Error("Missing required environment variable: SHOPIFY_STORE_NAME");
  }
  const storeName = normalizeStoreName(rawStoreName);

  if (!accessToken && !(clientId && clientSecret)) {
    throw new Error(
      "Missing credentials. Set either SHOPIFY_ACCESS_TOKEN (partner dashboard apps) " +
      "or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (store-created custom apps)."
    );
  }

  return { storeName, accessToken, clientId, clientSecret, apiVersion };
}
