import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShopifyClient } from "../src/shopify-client.js";
import type { ShopifyConfig } from "../src/config.js";
import { getAccessToken } from "../src/auth.js";

// Mock auth module
vi.mock("../src/auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

const mockedGetAccessToken = vi.mocked(getAccessToken);

const testConfig: ShopifyConfig = {
  storeName: "test-store",
  clientId: "test-id",
  clientSecret: "test-secret",
  apiVersion: "2026-01",
};

describe("ShopifyClient", () => {
  let client: ShopifyClient;

  beforeEach(() => {
    client = new ShopifyClient(testConfig);
    vi.restoreAllMocks();
    mockedGetAccessToken.mockResolvedValue("test-token");
  });

  describe("constructor", () => {
    it("builds correct base URL from config", () => {
      expect((client as any).baseUrl).toBe(
        "https://test-store.myshopify.com/admin/api/2026-01"
      );
    });
  });

  describe("graphql()", () => {
    it("sends POST to graphql.json endpoint", async () => {
      const mockData = { product: { id: "gid://shopify/Product/1" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: mockData }), { status: 200 })
      );

      const result = await client.graphql("query { product { id } }");

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://test-store.myshopify.com/admin/api/2026-01/graphql.json");
      expect(opts?.method).toBe("POST");
      expect(result).toEqual(mockData);
    });

    it("passes variables in request body", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 200 })
      );

      await client.graphql("query ($id: ID!) { node(id: $id) { id } }", {
        id: "gid://shopify/Product/1",
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.variables).toEqual({ id: "gid://shopify/Product/1" });
    });

    it("throws on GraphQL errors", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: "Field not found" }] }),
          { status: 200 }
        )
      );

      await expect(client.graphql("{ bad }")).rejects.toThrow("Shopify GraphQL errors");
    });

    it("throws on non-ok HTTP response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 })
      );

      await expect(client.graphql("{ shop { name } }")).rejects.toThrow(
        "Shopify GraphQL error 401"
      );
    });

    it("retries after a 429 response and returns data on success", async () => {
      vi.useFakeTimers();
      try {
        const fetchSpy = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "1" } }))
          .mockResolvedValueOnce(new Response(JSON.stringify({ data: { shop: { name: "ok" } } }), { status: 200 }));

        const promise = client.graphql("{ shop { name } }");
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(promise).resolves.toEqual({ shop: { name: "ok" } });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("retries THROTTLED GraphQL errors and returns data on success", async () => {
      vi.useFakeTimers();
      try {
        const throttled = { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] };
        const fetchSpy = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(new Response(JSON.stringify(throttled), { status: 200 }))
          .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));

        const promise = client.graphql("{ shop { name } }");
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(promise).resolves.toEqual({ ok: true });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("gives up after exhausting retries on persistent 429s", async () => {
      vi.useFakeTimers();
      try {
        const fetchSpy = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

        const promise = client.graphql("{ shop { name } }");
        const assertion = expect(promise).rejects.toThrow("Shopify GraphQL error 429");
        await vi.advanceTimersByTimeAsync(60_000);
        await assertion;
        expect(fetchSpy).toHaveBeenCalledTimes(4); // initial + 3 retries
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
