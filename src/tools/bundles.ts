import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

const componentOptionSelectionSchema = z.object({
  component_option_id: z
    .string()
    .describe("GID of the option on the component product (e.g. 'gid://shopify/ProductOption/123')."),
  name: z
    .string()
    .describe("Name to create for this option on the parent bundle product (e.g. 'Color')."),
  values: z
    .array(z.string())
    .min(1)
    .describe("Selected option values from the component to include in the bundle (e.g. ['Red', 'Blue'])."),
});

const componentSchema = z.object({
  product_id: z
    .string()
    .describe("GID of the component product (e.g. 'gid://shopify/Product/123')."),
  quantity: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe("Fixed quantity of this component per bundle (1–2000). Omit if using quantity_option instead."),
  option_selections: z
    .array(componentOptionSelectionSchema)
    .describe("Options from the component product to expose on the bundle. Each entry maps a component option to a parent option name with a subset of allowed values."),
});

export function registerBundleTools(server: McpServer, client: ShopifyClient) {
  // ── Create a product bundle ───────────────────────────────────────
  server.tool(
    "create_bundle",
    "Create a fixed product bundle using the Shopify Bundles app. Groups multiple component products into a single parent product. The operation is asynchronous — use get_bundle_operation with the returned operation ID to poll until status is COMPLETE. Requires the Shopify Bundles app to be installed and write_products scope.",
    {
      title: z.string().describe("Title of the bundle product to create."),
      components: z
        .array(componentSchema)
        .min(1)
        .describe("Component products to include in the bundle."),
    },
    async ({ title, components }) => {
      const input = {
        title,
        components: components.map((c) => ({
          productId: c.product_id,
          ...(c.quantity !== undefined ? { quantity: c.quantity } : {}),
          optionSelections: c.option_selections.map((o) => ({
            componentOptionId: o.component_option_id,
            name: o.name,
            values: o.values,
          })),
        })),
      };

      const mutation = `
        mutation CreateBundle($input: ProductBundleCreateInput!) {
          productBundleCreate(input: $input) {
            productBundleOperation {
              id
              status
              product {
                id
                title
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = await client.graphql<{
        productBundleCreate: {
          productBundleOperation: { id: string; status: string; product: { id: string; title: string } | null } | null;
          userErrors: { field: string[]; message: string }[];
        };
      }>(mutation, { input });

      const { productBundleOperation, userErrors } = data.productBundleCreate;
      if (userErrors.length > 0) {
        throw new Error(`productBundleCreate errors: ${userErrors.map((e) => e.message).join(", ")}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(productBundleOperation, null, 2) }],
      };
    }
  );

  // ── Update a product bundle ───────────────────────────────────────
  server.tool(
    "update_bundle",
    "Update an existing product bundle. Providing components replaces ALL current components — omit components to leave them unchanged. The operation is asynchronous — use get_bundle_operation with the returned operation ID to poll until status is COMPLETE. Requires write_products scope.",
    {
      product_id: z
        .string()
        .describe("GID of the bundle product to update (e.g. 'gid://shopify/Product/123')."),
      title: z.string().optional().describe("New title for the bundle product."),
      components: z
        .array(componentSchema)
        .min(1)
        .optional()
        .describe("Replacement component list. If provided, fully replaces all existing components."),
    },
    async ({ product_id, title, components }) => {
      const input: Record<string, unknown> = { productId: product_id };
      if (title !== undefined) input.title = title;
      if (components !== undefined) {
        input.components = components.map((c) => ({
          productId: c.product_id,
          ...(c.quantity !== undefined ? { quantity: c.quantity } : {}),
          optionSelections: c.option_selections.map((o) => ({
            componentOptionId: o.component_option_id,
            name: o.name,
            values: o.values,
          })),
        }));
      }

      const mutation = `
        mutation UpdateBundle($input: ProductBundleUpdateInput!) {
          productBundleUpdate(input: $input) {
            productBundleOperation {
              id
              status
              product {
                id
                title
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = await client.graphql<{
        productBundleUpdate: {
          productBundleOperation: { id: string; status: string; product: { id: string; title: string } | null } | null;
          userErrors: { field: string[]; message: string }[];
        };
      }>(mutation, { input });

      const { productBundleOperation, userErrors } = data.productBundleUpdate;
      if (userErrors.length > 0) {
        throw new Error(`productBundleUpdate errors: ${userErrors.map((e) => e.message).join(", ")}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(productBundleOperation, null, 2) }],
      };
    }
  );

  // ── Get a bundle with its components ─────────────────────────────
  server.tool(
    "get_bundle",
    "Get full details of a bundle product including its component products, quantities, and option mappings. Uses GraphQL to fetch bundleComponents — unlike get_product (REST), this tool shows the bundle structure.",
    {
      product_id: z
        .string()
        .describe("The numeric Shopify product ID or GID of the bundle product (e.g. 'gid://shopify/Product/123' or '123')."),
    },
    async ({ product_id }) => {
      const gid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;

      const query = `
        query GetBundle($id: ID!) {
          product(id: $id) {
            id
            title
            status
            bundleComponents(first: 20) {
              nodes {
                componentProduct {
                  id
                  title
                }
                quantity
                optionSelections {
                  componentOption {
                    id
                    name
                  }
                  parentOption {
                    id
                    name
                  }
                  values {
                    value
                    selectionStatus
                  }
                }
              }
            }
          }
        }
      `;

      const data = await client.graphql<{
        product: {
          id: string;
          title: string;
          status: string;
          bundleComponents: {
            nodes: {
              componentProduct: { id: string; title: string };
              quantity: number | null;
              optionSelections: {
                componentOption: { id: string; name: string };
                parentOption: { id: string; name: string } | null;
                values: { value: string; selectionStatus: string }[];
              }[];
            }[];
          };
        } | null;
      }>(query, { id: gid });

      if (!data.product) throw new Error(`Bundle product not found: ${gid}`);

      return {
        content: [{ type: "text", text: JSON.stringify(data.product, null, 2) }],
      };
    }
  );

  // ── Poll a bundle operation ───────────────────────────────────────
  server.tool(
    "get_bundle_operation",
    "Poll the status of an asynchronous bundle create or update operation. Status values: CREATED (queued), ACTIVE (in progress), COMPLETE (done — product is ready). Call this after create_bundle or update_bundle until status is COMPLETE. Requires read_products scope.",
    {
      operation_id: z
        .string()
        .describe("GID of the ProductBundleOperation returned by create_bundle or update_bundle (e.g. 'gid://shopify/ProductBundleOperation/123')."),
    },
    async ({ operation_id }) => {
      const query = `
        query GetBundleOperation($id: ID!) {
          productOperation(id: $id) {
            ... on ProductBundleOperation {
              id
              status
              product {
                id
                title
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        }
      `;

      const data = await client.graphql<{
        productOperation: {
          id: string;
          status: string;
          product: { id: string; title: string; status: string } | null;
          userErrors: { field: string[]; message: string }[];
        } | null;
      }>(query, { id: operation_id });

      return {
        content: [{ type: "text", text: JSON.stringify(data.productOperation, null, 2) }],
      };
    }
  );
}
