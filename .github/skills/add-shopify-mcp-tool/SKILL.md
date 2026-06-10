---
name: add-shopify-mcp-tool
description: 'Add or update a Shopify MCP server tool in this repo. Use when implementing Shopify Admin GraphQL tools, tool schemas, GraphQL mutations/queries, README tool docs, and tool-registration tests. Requires shopify-dev-mcp as the Shopify API reference source.'
argument-hint: 'Describe the Shopify MCP tool or resource to add'
---

# Add Shopify MCP Tool

Use this skill to add or change a tool in this TypeScript Shopify MCP server. It produces a focused implementation, matching tests, and README updates while using `shopify-dev-mcp` for Shopify API facts.

## Outcome

- A new or updated Admin GraphQL-backed tool in the appropriate `src/tools/*.ts` module.
- Updated registration in `src/index.ts` if a new tool group is needed.
- Updated expected tool names and group counts in `tests/tools.test.ts` when registrations change.
- Focused tests for behavior that is more than simple pass-through.
- README tool-list updates for user-visible additions, removals, or parameter changes.
- Shopify API details verified through `shopify-dev-mcp`, not web search or memory.

## Procedure

1. Restate the requested tool in implementation terms: resource, operation, Admin GraphQL mutation/query, required scopes if known, required inputs, optional inputs, and expected result shape.
2. Read [AGENTS.md](../../../AGENTS.md), the relevant existing module in `src/tools/`, [src/shopify-client.ts](../../../src/shopify-client.ts), [src/index.ts](../../../src/index.ts), [tests/tools.test.ts](../../../tests/tools.test.ts), and the matching README section.
3. Load Shopify documentation with `shopify-dev-mcp` before designing the API call:
   - Start with `learn_shopify_api(api: "admin")` for Shopify Admin GraphQL tools.
   - If the request mentions metafields or metaobjects, call `learn_shopify_api(api: "custom-data")` first, then call `learn_shopify_api(api: "admin")` with the same conversation ID for the operation details.
   - Use `search_docs_chunks` with the same conversation ID and API filter to retrieve exact fields, mutations, input types, limits, user error shapes, and examples.
   - Do not use general web search for Shopify API facts.
4. Choose the smallest code location that matches existing ownership:
   - Add related tools to the current resource module in `src/tools/`.
   - Create a new `src/tools/<resource>.ts` module only for a genuinely new resource group, then import and register it in [src/index.ts](../../../src/index.ts).
   - Reuse `ShopifyClient.graphql` for all Shopify Admin API calls.
5. Implement the tool in the repo style:
   - Use global `snake_case` MCP tool names.
   - Define parameters with Zod schemas and useful `.describe()` text.
   - Treat numeric Shopify IDs as strings at the tool boundary.
   - For GraphQL GIDs, accept an existing GID or normalize a numeric ID when existing tools do so.
   - Return MCP text content, using `JSON.stringify(value, null, 2)` for structured data.
   - Keep stdout reserved for MCP protocol traffic; diagnostics go to stderr only.
6. Validate Shopify GraphQL before finalizing:
   - Run `validate_graphql_codeblocks(api: "admin")` for every generated or edited Admin GraphQL query or mutation.
   - If validation fails, fix the query or mutation from the validation feedback and re-run validation with the same artifact ID and incremented revision.
7. Update tests:
   - If a tool registration changed, update `EXPECTED_TOOL_NAMES`, total count, and group count in [tests/tools.test.ts](../../../tests/tools.test.ts).
   - Add focused handler tests when the tool transforms inputs, builds GraphQL variables, handles default values, maps user errors, or normalizes IDs.
   - Mock `ShopifyClient` methods or `fetch`; never call real Shopify APIs from tests.
8. Update docs:
   - Add or adjust the README tool-list row for the tool group.
   - Keep setup and auth details linked to existing README sections instead of duplicating them elsewhere.
9. Verify locally:
   - Run `npm run build`.
   - Run focused tests first, then `npm test` if practical.
   - If unrelated existing tests fail, report the exact failing files and why they appear unrelated.
10. Final response should summarize files changed, Shopify documentation or validation used, commands run, and any remaining risks or known test failures.

## Decision Points

- Prefer GraphQL for all Shopify Admin API operations.
- If Shopify lacks a GraphQL equivalent, document the limitation and ask before adding a non-GraphQL fallback.
- Add an abstraction only if multiple tools need the same non-trivial transformation, GID normalization, or user-error handling.
- Ask a clarifying question only when the request lacks an essential choice such as target resource, operation semantics, or destructive behavior.

## Completion Checks

- The tool name is unique across all registered tools.
- The Zod schema matches the documented Shopify API inputs and includes helpful descriptions.
- The implementation handles Shopify GraphQL `userErrors` when the mutation returns them.
- README, registration tests, and group counts agree with the implemented tools.
- `npm run build` passes, or any failure is clearly unrelated and reported.
- Shopify API facts came from `shopify-dev-mcp` in the current turn.
