import { ShopifyConfig } from "./config.js";
import { getAccessToken } from "./auth.js";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottledGraphQLError(errors: unknown[]): boolean {
  return errors.some((error) => {
    const code = (error as { extensions?: { code?: string } })?.extensions?.code;
    return code === "THROTTLED";
  });
}

/**
 * Shopify Admin GraphQL API client.
 * Handles authentication, request building, rate-limit retries, and error formatting.
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

    for (let attempt = 0; ; attempt++) {
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

      // Rate limited at the HTTP level — back off and retry, honoring Retry-After
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_RETRY_DELAY_MS * 2 ** attempt;
        process.stderr.write(`[shopify-mcp] Rate limited (429); retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})\n`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text();
        const error = new Error(`Shopify GraphQL error ${res.status}: ${errBody}`);
        process.stderr.write(`[shopify-mcp] ${error.message}\n`);
        throw error;
      }

      const json = (await res.json()) as { data?: T; errors?: unknown[] };
      if (json.errors) {
        // GraphQL cost-based throttling returns 200 with a THROTTLED error code
        if (isThrottledGraphQLError(json.errors) && attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * 2 ** attempt;
          process.stderr.write(`[shopify-mcp] Query throttled; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})\n`);
          await sleep(delay);
          continue;
        }
        const error = new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
        process.stderr.write(`[shopify-mcp] ${error.message}\n`);
        throw error;
      }
      return json.data as T;
    }
  }
}
