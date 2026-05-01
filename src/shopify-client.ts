import { ShopifyConfig } from "./config.js";
import { getAccessToken } from "./auth.js";

/**
 * Shopify Admin GraphQL API client.
 * Handles authentication, request building, and error formatting.
 */
export class ShopifyClient {
  private config: ShopifyConfig;
  private baseUrl: string;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.baseUrl = `https://${config.storeName}.myshopify.com/admin/api/${config.apiVersion}`;
  }

  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken(this.config);
    const url = `${this.baseUrl}/graphql.json`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const error = new Error(`Network error on GraphQL request: ${msg}`);
      process.stderr.write(`[shopify-mcp] ${error.message}\n`);
      throw error;
    }

    if (!res.ok) {
      const errBody = await res.text();
      const error = new Error(`Shopify GraphQL error ${res.status}: ${errBody}`);
      process.stderr.write(`[shopify-mcp] ${error.message}\n`);
      throw error;
    }

    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors) {
      const error = new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
      process.stderr.write(`[shopify-mcp] ${error.message}\n`);
      throw error;
    }
    return json.data as T;
  }
}
