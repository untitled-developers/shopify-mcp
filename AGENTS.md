# Agent Instructions

This is a TypeScript CommonJS MCP server for the Shopify Admin API. Keep changes small, typed, and consistent with the existing tool-registration pattern.

## Commands

- `npm install` installs dependencies; this repo uses npm and has a committed `package-lock.json`.
- `npm run build` compiles `src/` to `dist/` with `tsc`.
- `npm test` runs the Vitest suite once.
- `npm run dev` starts the MCP server from `src/index.ts` through `ts-node`.
- `npm run get-token` runs the OAuth helper after a build, using `dist/get-token.js`.

## Project Map

- [README.md](README.md) has setup, MCP client configuration, environment variables, and the public tool list. Link to it instead of duplicating setup docs.
- [src/index.ts](src/index.ts) is the stdio MCP entry point and registers every tool group.
- [src/shopify-client.ts](src/shopify-client.ts) is the shared Shopify Admin GraphQL client. Prefer extending it over creating ad hoc fetch logic.
- [src/config.ts](src/config.ts) loads `.env` from the MCP host working directory first, then from the package directory. `SHOPIFY_API_VERSION` defaults to `2026-01`.
- [src/auth.ts](src/auth.ts) currently requires `SHOPIFY_ACCESS_TOKEN`; Partner Dashboard OAuth token acquisition lives in [src/get-token.ts](src/get-token.ts).
- [src/tools/](src/tools/) contains one module per tool group, each exporting `registerXxxTools(server, client)`.
- [tests/](tests/) contains Vitest tests for config, auth, the Shopify client, and tool registration.

## Coding Conventions

- Use strict TypeScript and keep `.js` extensions in relative imports, even when importing `.ts` source files.
- Tool names are global MCP names in `snake_case`; check [tests/tools.test.ts](tests/tools.test.ts) to avoid collisions.
- Define tool parameters with Zod schemas and useful `.describe()` text for MCP clients.
- Use Admin GraphQL for Shopify API operations. Do not add non-GraphQL Shopify API calls unless Shopify has no GraphQL equivalent and the limitation is documented.
- Return MCP tool results as `{ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }` unless the existing tool group uses a clearer plain-text success message.
- Treat numeric Shopify IDs as strings at tool boundaries. When GraphQL needs GIDs, follow existing tools that accept either a GID or numeric ID and normalize internally.
- Keep stdout reserved for MCP JSON-RPC. Send diagnostics to stderr with the existing `[shopify-mcp]` style.

## Adding Or Changing Tools

- Add related tools to the existing module in [src/tools/](src/tools/) when possible; create a new module only for a new resource group.
- If a new tool group is added, import and register it in [src/index.ts](src/index.ts).
- Update [tests/tools.test.ts](tests/tools.test.ts) for expected tool names and group counts whenever tool registrations change.
- Update the README tool list for user-visible tool additions, removals, or renamed parameters.
- Mock `fetch` or `ShopifyClient` methods in tests. Do not call real Shopify APIs from the test suite.

## Validation Notes

- `npm test` should pass fully; treat any failure as caused by your change until proven otherwise.
- [tests/shopify-client.test.ts](tests/shopify-client.test.ts) and [tests/tools.test.ts](tests/tools.test.ts) are useful focused checks for client behavior and tool-registration changes; [tests/graphql-helpers.test.ts](tests/graphql-helpers.test.ts) covers the shared helpers.
