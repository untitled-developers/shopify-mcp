import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

const testConfig = {
  storeName: "test-store",
  accessToken: "shpat_test_token",
  apiVersion: "2026-01",
};

const clientCredsConfig = {
  storeName: "test-store",
  clientId: "abc123",
  clientSecret: "shpss_secret",
  apiVersion: "2026-01",
};

describe("getAccessToken", () => {
  it("returns the configured access token directly", async () => {
    const { getAccessToken } = await import("../src/auth.js");
    const token = await getAccessToken(testConfig);

    expect(token).toBe("shpat_test_token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns the same access token on subsequent calls without fetching", async () => {
    const { getAccessToken } = await import("../src/auth.js");
    const token1 = await getAccessToken(testConfig);
    const token2 = await getAccessToken(testConfig);

    expect(token1).toBe("shpat_test_token");
    expect(token2).toBe("shpat_test_token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws a helpful error when no credentials are provided", async () => {
    const { getAccessToken } = await import("../src/auth.js");
    await expect(
      getAccessToken({ storeName: "test-store", apiVersion: "2026-01" })
    ).rejects.toThrow("Authentication failed: no credentials found.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses client_credentials grant when clientId and clientSecret are set", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "shpat_from_oauth" }),
    });

    const { getAccessToken } = await import("../src/auth.js");
    const token = await getAccessToken(clientCredsConfig);

    expect(token).toBe("shpat_from_oauth");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-store.myshopify.com/admin/oauth/access_token");
    expect(opts.body).toContain("grant_type=client_credentials");
    expect(opts.body).toContain("client_id=abc123");
  });

  it("caches the client_credentials token on repeated calls", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "shpat_cached" }),
    });

    const { getAccessToken } = await import("../src/auth.js");
    const t1 = await getAccessToken(clientCredsConfig);
    const t2 = await getAccessToken(clientCredsConfig);

    expect(t1).toBe("shpat_cached");
    expect(t2).toBe("shpat_cached");
    expect(mockFetch).toHaveBeenCalledOnce(); // only one OAuth call
  });

  it("throws when client_credentials grant returns a non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const { getAccessToken } = await import("../src/auth.js");
    await expect(getAccessToken(clientCredsConfig)).rejects.toThrow(
      "client_credentials grant failed (401): Unauthorized"
    );
  });

  it("throws when client_credentials response has no access_token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "invalid_client" }),
    });

    const { getAccessToken } = await import("../src/auth.js");
    await expect(getAccessToken(clientCredsConfig)).rejects.toThrow(
      "No access_token in client_credentials response"
    );
  });
});
