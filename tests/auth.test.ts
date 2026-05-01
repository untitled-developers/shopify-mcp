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

  it("throws a helpful error when SHOPIFY_ACCESS_TOKEN is missing", async () => {
    const { getAccessToken } = await import("../src/auth.js");
    await expect(getAccessToken({ ...testConfig, accessToken: undefined })).rejects.toThrow(
      "Authentication failed: SHOPIFY_ACCESS_TOKEN is not set."
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
