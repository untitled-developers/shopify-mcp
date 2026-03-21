import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dotenv before importing config
vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns config when all required env vars are set", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
    vi.stubEnv("SHOPIFY_API_VERSION", "2026-01");

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config).toEqual({
      storeName: "test-store",
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
    expect(() => loadConfig()).toThrow("Missing required environment variables");
  });

  it("throws when SHOPIFY_CLIENT_ID is missing", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
    delete process.env.SHOPIFY_CLIENT_ID;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Missing required environment variables");
  });

  it("throws when SHOPIFY_CLIENT_SECRET is missing", async () => {
    vi.stubEnv("SHOPIFY_STORE_NAME", "test-store");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-id");
    delete process.env.SHOPIFY_CLIENT_SECRET;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Missing required environment variables");
  });
});
