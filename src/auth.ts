import { ShopifyConfig } from "./config.js";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtains an access token using the client_credentials grant.
 * Caches the token and refreshes it when expired.
 */
export async function getAccessToken(config: ShopifyConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const shop = `${config.storeName}.myshopify.com`;
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify token request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  cachedToken = data.access_token;
  // Refresh 5 minutes before assumed 24h expiry
  tokenExpiresAt = now + 23 * 60 * 60 * 1000;
  return cachedToken;
}
