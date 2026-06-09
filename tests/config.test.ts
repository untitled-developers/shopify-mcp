import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dotenv before importing config
vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns config when store name and access token are set", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test_token");
    vi.stubEnv("SHOPIFY_API_VERSION", "2026-01");

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config).toEqual({
      storeName: "test-store",
      accessToken: "shpat_test_token",
      clientId: undefined,
      clientSecret: undefined,
      apiVersion: "2026-01",
    });
  });

  it("returns config when OAuth client credentials are set", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config).toEqual({
      storeName: "test-store",
      accessToken: undefined,
      clientId: "test-id",
      clientSecret: "test-secret",
      apiVersion: "2026-01",
    });
  });

  it("defaults apiVersion to 2026-01 when not set", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
    delete process.env.SHOPIFY_API_VERSION;

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.apiVersion).toBe("2026-01");
  });

  it("throws when SHOPIFY_STORE_NAME is missing", async () => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
    delete process.env.SHOPIFY_STORE_NAME;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Missing required environment variable: SHOPIFY_STORE_NAME");
  });

  it("throws when SHOPIFY_CLIENT_ID is missing", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
    delete process.env.SHOPIFY_CLIENT_ID;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Missing credentials. Set either SHOPIFY_ACCESS_TOKEN");
  });

  it("throws when SHOPIFY_CLIENT_SECRET is missing", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    delete process.env.SHOPIFY_CLIENT_SECRET;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Missing credentials. Set either SHOPIFY_ACCESS_TOKEN");
  });

  it("normalizes a full .myshopify.com domain to the bare subdomain", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store.myshopify.com");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test_token");

    const { loadConfig } = await import("../src/config.js");
    expect(loadConfig().storeName).toBe("test-store");
  });

  it("normalizes a full https URL to the bare subdomain", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "https://test-store.myshopify.com/admin");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test_token");

    const { loadConfig } = await import("../src/config.js");
    expect(loadConfig().storeName).toBe("test-store");
  });

  it("throws on a store name with unsafe characters", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "bad store/../../name");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test_token");

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Invalid SHOPIFY_STORE_NAME");
  });
});
