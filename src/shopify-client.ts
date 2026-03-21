import { ShopifyConfig } from "./config.js";
import { getAccessToken } from "./auth.js";

export interface ApiOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Shopify Admin REST API client.
 * Handles authentication, request building, and error formatting.
 */
export class ShopifyClient {
  private config: ShopifyConfig;
  private baseUrl: string;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.baseUrl = `https://${config.storeName}.myshopify.com/admin/api/${config.apiVersion}`;
  }

  async request<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const token = await getAccessToken(this.config);
    const { method = "GET", body, params } = options;

    let url = `${this.baseUrl}/${endpoint}`;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") qs.set(k, String(v));
      }
      const qsStr = qs.toString();
      if (qsStr) url += `?${qsStr}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Shopify API error ${res.status} on ${method} ${endpoint}: ${errBody}`);
    }

    // DELETE returns 200 with empty body
    if (res.status === 200 && res.headers.get("content-length") === "0") {
      return {} as T;
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken(this.config);
    const url = `${this.baseUrl}/graphql.json`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Shopify GraphQL error ${res.status}: ${errBody}`);
    }

    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data as T;
  }
}
