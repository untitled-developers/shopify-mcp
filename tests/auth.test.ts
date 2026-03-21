import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for auth tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We need to reset the cached token between tests.
// Since auth.ts uses module-level state, we reset modules per test.
beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

const testConfig = {
  storeName: "test-store",
  clientId: "test-id",
  clientSecret: "test-secret",
  apiVersion: "2026-01",
};

describe("getAccessToken", () => {
  it("fetches a new token on first call", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new-token-123" }), { status: 200 })
    );

    const { getAccessToken } = await import("../src/auth.js");
    const token = await getAccessToken(testConfig);

    expect(token).toBe("new-token-123");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-store.myshopify.com/admin/oauth/access_token");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.grant_type).toBe("client_credentials");
    expect(body.client_id).toBe("test-id");
    expect(body.client_secret).toBe("test-secret");
  });

  it("returns cached token on subsequent calls", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "cached-token" }), { status: 200 })
    );

    const { getAccessToken } = await import("../src/auth.js");
    const token1 = await getAccessToken(testConfig);
    const token2 = await getAccessToken(testConfig);

    expect(token1).toBe("cached-token");
    expect(token2).toBe("cached-token");
    expect(mockFetch).toHaveBeenCalledOnce(); // only one fetch
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"error":"invalid_client"}', { status: 401 })
    );

    const { getAccessToken } = await import("../src/auth.js");
    await expect(getAccessToken(testConfig)).rejects.toThrow(
      "Shopify token request failed (401)"
    );
  });
});
