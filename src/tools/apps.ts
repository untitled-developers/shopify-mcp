import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerAppTools(server: McpServer, client: ShopifyClient) {
  // ── List app installations ─────────────────────────────────────────
  server.tool(
    "list_app_installations",
    "List apps installed on the store. Returns details about each app installation including the app name, access scopes granted, and active subscriptions.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of installations to return (1–250). Default: 10."),
      after: z.string().optional().describe("Cursor for forward pagination."),
      category: z
        .enum(["CHANNEL", "CUSTOM", "OTHER", "POINT_OF_SALE", "SALES_CHANNEL"])
        .optional()
        .describe("Filter by app category."),
      sort_key: z
        .enum(["APP_TITLE", "ID", "INSTALLED_AT"])
        .optional()
        .describe("Field to sort by. Default: INSTALLED_AT."),
      reverse: z.boolean().optional().describe("Reverse sort order."),
    },
    async ({ limit, after, category, sort_key, reverse }) => {
      const query = `
        query ListAppInstallations(
          $first: Int!,
          $after: String,
          $category: AppInstallationCategory,
          $sortKey: AppInstallationSortKeys,
          $reverse: Boolean
        ) {
          appInstallations(
            first: $first,
            after: $after,
            category: $category,
            sortKey: $sortKey,
            reverse: $reverse
          ) {
            nodes {
              id
              launchUrl
              uninstallUrl
              accessScopes {
                handle
                description
              }
              activeSubscriptions {
                id
                name
                status
                currentPeriodEnd
              }
              app {
                id
                title
                description
                developerName
                handle
                icon { url }
                pricingDetailsSummary
                privacyPolicyUrl
                publicCategory
                isPostPurchaseAppInUse
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      const data = await client.graphql<{
        appInstallations: { nodes: unknown[]; pageInfo: unknown };
      }>(query, {
        first: limit,
        after: after ?? null,
        category: category ?? null,
        sortKey: sort_key ?? null,
        reverse: reverse ?? null,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.appInstallations, null, 2) }],
      };
    }
  );

  // ── Get app installation ───────────────────────────────────────────
  server.tool(
    "get_app_installation",
    "Get details of a specific app installation by its GID, including access scopes and active subscriptions.",
    {
      installation_id: z
        .string()
        .describe("The GID of the app installation (e.g. 'gid://shopify/AppInstallation/123')."),
    },
    async ({ installation_id }) => {
      const query = `
        query GetAppInstallation($id: ID!) {
          appInstallation(id: $id) {
            id
            launchUrl
            uninstallUrl
            accessScopes {
              handle
              description
            }
            activeSubscriptions {
              id
              name
              status
              currentPeriodEnd
              trialDays
            }
            app {
              id
              title
              description
              developerName
              handle
              icon { url }
              pricingDetailsSummary
              privacyPolicyUrl
              publicCategory
              isPostPurchaseAppInUse
              previouslyInstalled
              requestedAccessScopes { handle description }
            }
          }
        }
      `;
      const data = await client.graphql<{ appInstallation: unknown }>(query, { id: installation_id });
      return {
        content: [{ type: "text", text: JSON.stringify(data.appInstallation, null, 2) }],
      };
    }
  );
}
