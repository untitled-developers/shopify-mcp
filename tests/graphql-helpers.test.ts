import { describe, it, expect } from "vitest";
import { gid, nodes, compact, throwOnUserErrors, searchQuery } from "../src/tools/graphql-helpers.js";

describe("gid", () => {
  it("wraps numeric IDs in a GID", () => {
    expect(gid("Product", "123")).toBe("gid://shopify/Product/123");
  });

  it("passes through existing GIDs unchanged", () => {
    expect(gid("Product", "gid://shopify/Product/123")).toBe("gid://shopify/Product/123");
  });
});

describe("nodes", () => {
  it("returns nodes when present", () => {
    expect(nodes({ nodes: [1, 2] })).toEqual([1, 2]);
  });

  it("unwraps edges when nodes are absent", () => {
    expect(nodes({ edges: [{ node: "a" }, { node: "b" }] })).toEqual(["a", "b"]);
  });

  it("returns an empty array for null/undefined connections", () => {
    expect(nodes(null)).toEqual([]);
    expect(nodes(undefined)).toEqual([]);
  });
});

describe("compact", () => {
  it("removes undefined, null, and empty-string values", () => {
    expect(compact({ a: 1, b: undefined, c: null, d: "", e: false, f: 0 })).toEqual({ a: 1, e: false, f: 0 });
  });
});

describe("throwOnUserErrors", () => {
  it("does nothing for empty or missing errors", () => {
    expect(() => throwOnUserErrors("op", [])).not.toThrow();
    expect(() => throwOnUserErrors("op", null)).not.toThrow();
    expect(() => throwOnUserErrors("op", undefined)).not.toThrow();
  });

  it("includes the field path in the message", () => {
    expect(() => throwOnUserErrors("productCreate", [{ field: ["input", "title"], message: "is required" }]))
      .toThrow("productCreate errors: input.title: is required");
  });

  it("joins multiple errors", () => {
    expect(() => throwOnUserErrors("op", [{ message: "first" }, { message: "second" }]))
      .toThrow("op errors: first; second");
  });
});

describe("searchQuery", () => {
  it("joins simple key:value pairs", () => {
    expect(searchQuery({ status: "active", vendor: "Acme" })).toBe("status:active vendor:Acme");
  });

  it("quotes values containing spaces", () => {
    expect(searchQuery({ title: "Kitchen Knife" })).toBe('title:"Kitchen Knife"');
  });

  it("escapes embedded quotes", () => {
    expect(searchQuery({ title: 'The "Best" Knife' })).toBe('title:"The \\"Best\\" Knife"');
  });

  it("skips undefined and empty values and returns undefined when nothing remains", () => {
    expect(searchQuery({ a: undefined, b: "" })).toBeUndefined();
  });
});
