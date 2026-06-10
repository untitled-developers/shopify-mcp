import { ShopifyConfig } from "./config.js";

// In-memory token cache for client_credentials grant
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Returns the Shopify Admin API access token.
 *
 * If SHOPIFY_ACCESS_TOKEN is set (partner dashboard / store custom apps), it is used directly.
 * Otherwise uses the client_credentials OAuth grant with SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 * (store-created custom apps created directly in the Shopify admin).
 */
export async function getAccessToken(config: ShopifyConfig): Promise<string> {
  // Direct access token — no OAuth needed
  if (config.accessToken) {
    return config.accessToken;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "Authentication failed: no credentials found.\n\n" +
      "Set SHOPIFY_ACCESS_TOKEN (any app type) or both SHOPIFY_CLIENT_ID and " +
      "SHOPIFY_CLIENT_SECRET (store-created custom apps).\n\n" +
      "For Partner Dashboard apps without a stored token, run the OAuth helper:\n" +
      "  node /path/to/shopify-mcp/dist/get-token.js"
    );
  }

  // Return cached token if still valid (cache for 55 min; tokens last ~1 hour)
  const cacheKey = `${config.storeName}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  // client_credentials grant — only works for store-created custom apps
  const tokenUrl = `https://${config.storeName}.myshopify.com/admin/oauth/access_token`;
  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error during client_credentials grant: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text();
    let hint = "";
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error === "app_not_installed") {
        hint =
          "\n\nThe app is not installed on this store. For store-created custom apps:\n" +
          "  1. Go to Shopify Admin → Settings → Apps and sales channels → Develop apps\n" +
          "  2. Select your app and click \"Install app\"\n" +
          "  3. Copy the Admin API access token (shown once, starts with shpat_)\n" +
          "  4. Add SHOPIFY_ACCESS_TOKEN=shpat_... to your .env file";
      }
    } catch { /* ignore parse errors */ }
    throw new Error(`client_credentials grant failed (${res.status}): ${body}${hint}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error(`No access_token in client_credentials response: ${JSON.stringify(data)}`);
  }

  tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 });
  process.stderr.write(`[shopify-mcp] client_credentials token obtained for ${config.storeName}\n`);
  return data.access_token;
}
