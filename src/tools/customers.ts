import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

export function registerCustomerTools(server: McpServer, client: ShopifyClient) {
  // ── List customers ────────────────────────────────────────────────
  server.tool(
    "list_customers",
    "List customers in the store. Supports pagination and basic filtering by creation date.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of customers to return (1–250). Default: 10."),
      since_id: z.string().optional().describe("Return customers after this ID."),
      created_at_min: z.string().optional().describe("Minimum creation date (ISO 8601)."),
      created_at_max: z.string().optional().describe("Maximum creation date (ISO 8601)."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, created_at_min, created_at_max, page_info }) => {
      const data = await client.request<{ customers: unknown[] }>("customers.json", {
        params: { limit, since_id, created_at_min, created_at_max, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.customers, null, 2) }],
      };
    }
  );

  // ── Search customers ──────────────────────────────────────────────
  server.tool(
    "search_customers",
    "Search for customers using a query string. Supports Shopify search syntax (e.g. 'email:john@example.com', 'country:US', or just a name).",
    {
      query: z.string().describe("Search query (e.g. 'email:john@example.com' or 'Jane Doe')."),
      limit: z.number().min(1).max(250).default(10).describe("Number of results (1–250). Default: 10."),
    },
    async ({ query, limit }) => {
      const data = await client.request<{ customers: unknown[] }>("customers/search.json", {
        params: { query, limit },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.customers, null, 2) }],
      };
    }
  );

  // ── Get a single customer ─────────────────────────────────────────
  server.tool(
    "get_customer",
    "Get full details of a single customer by their ID, including addresses, order count, and total spent.",
    {
      customer_id: z.string().describe("The numeric Shopify customer ID."),
    },
    async ({ customer_id }) => {
      const data = await client.request<{ customer: unknown }>(`customers/${customer_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.customer, null, 2) }],
      };
    }
  );

  // ── Create a customer ─────────────────────────────────────────────
  server.tool(
    "create_customer",
    "Create a new customer. At minimum provide an email. Optionally include name, phone, address, and tags.",
    {
      email: z.string().optional().describe("Customer email address."),
      first_name: z.string().optional().describe("First name."),
      last_name: z.string().optional().describe("Last name."),
      phone: z.string().optional().describe("Phone number in E.164 format (e.g. '+14155551234')."),
      tags: z.string().optional().describe("Comma-separated tags."),
      note: z.string().optional().describe("Internal note about the customer."),
      addresses: z
        .array(
          z.object({
            address1: z.string().optional(),
            address2: z.string().optional(),
            city: z.string().optional(),
            province: z.string().optional(),
            country: z.string().optional(),
            zip: z.string().optional(),
            phone: z.string().optional(),
          })
        )
        .optional()
        .describe("Customer addresses."),
    },
    async ({ email, first_name, last_name, phone, tags, note, addresses }) => {
      const customer: Record<string, unknown> = {};
      if (email) customer.email = email;
      if (first_name) customer.first_name = first_name;
      if (last_name) customer.last_name = last_name;
      if (phone) customer.phone = phone;
      if (tags) customer.tags = tags;
      if (note) customer.note = note;
      if (addresses) customer.addresses = addresses;

      const data = await client.request<{ customer: unknown }>("customers.json", {
        method: "POST",
        body: { customer },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.customer, null, 2) }],
      };
    }
  );

  // ── Update a customer ─────────────────────────────────────────────
  server.tool(
    "update_customer",
    "Update an existing customer. Only provided fields are changed; omitted fields remain unchanged.",
    {
      customer_id: z.string().describe("The numeric Shopify customer ID."),
      email: z.string().optional().describe("New email."),
      first_name: z.string().optional().describe("New first name."),
      last_name: z.string().optional().describe("New last name."),
      phone: z.string().optional().describe("New phone number."),
      tags: z.string().optional().describe("New comma-separated tags (replaces existing)."),
      note: z.string().optional().describe("New internal note."),
    },
    async ({ customer_id, ...fields }) => {
      const customer: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) customer[k] = v;
      }
      const data = await client.request<{ customer: unknown }>(`customers/${customer_id}.json`, {
        method: "PUT",
        body: { customer },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.customer, null, 2) }],
      };
    }
  );

  // ── List customer metafields ────────────────────────────────────
  server.tool(
    "list_customer_metafields",
    "List all metafields for a customer via GraphQL.",
    {
      customer_id: z.string().describe("The numeric Shopify customer ID (or GID)."),
      namespace: z.string().optional().describe("Filter by namespace."),
      limit: z.number().min(1).max(100).default(50).describe("Number of metafields to return. Default: 50."),
    },
    async ({ customer_id, namespace, limit }) => {
      const gid = customer_id.startsWith("gid://") ? customer_id : `gid://shopify/Customer/${customer_id}`;
      const query = `query ($id: ID!, $namespace: String, $first: Int!) {
        customer(id: $id) {
          metafields(namespace: $namespace, first: $first) {
            edges {
              node { id namespace key type jsonValue description createdAt updatedAt }
            }
          }
        }
      }`;
      const data = await client.graphql<{
        customer: { metafields: { edges: { node: unknown }[] } };
      }>(query, { id: gid, namespace: namespace ?? null, first: limit });
      const metafields = data.customer.metafields.edges.map((e) => e.node);
      return {
        content: [{ type: "text", text: JSON.stringify(metafields, null, 2) }],
      };
    }
  );

  // ── Get a customer metafield ─────────────────────────────────────
  server.tool(
    "get_customer_metafield",
    "Get a single customer metafield by namespace and key.",
    {
      customer_id: z.string().describe("The numeric Shopify customer ID (or GID)."),
      namespace: z.string().describe("Metafield namespace."),
      key: z.string().describe("Metafield key."),
    },
    async ({ customer_id, namespace, key }) => {
      const gid = customer_id.startsWith("gid://") ? customer_id : `gid://shopify/Customer/${customer_id}`;
      const query = `query ($id: ID!, $namespace: String!, $key: String!) {
        customer(id: $id) {
          metafield(namespace: $namespace, key: $key) {
            id namespace key type jsonValue description createdAt updatedAt
          }
        }
      }`;
      const data = await client.graphql<{
        customer: { metafield: unknown };
      }>(query, { id: gid, namespace, key });
      return {
        content: [{ type: "text", text: JSON.stringify(data.customer.metafield, null, 2) }],
      };
    }
  );

  // ── Set a customer metafield ─────────────────────────────────────
  server.tool(
    "set_customer_metafield",
    "Create or update a customer metafield using metafieldsSet (upsert).",
    {
      customer_id: z.string().describe("The numeric Shopify customer ID (or GID)."),
      namespace: z.string().optional().describe("Metafield namespace."),
      key: z.string().describe("Metafield key."),
      value: z.string().describe("Metafield value."),
      type: z.string().optional().describe("Metafield type (required when creating new)."),
    },
    async ({ customer_id, namespace, key, value, type }) => {
      const gid = customer_id.startsWith("gid://") ? customer_id : `gid://shopify/Customer/${customer_id}`;
      const metafield: Record<string, unknown> = { ownerId: gid, key, value };
      if (namespace) metafield.namespace = namespace;
      if (type) metafield.type = type;
      const query = `mutation ($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type jsonValue createdAt updatedAt }
          userErrors { field message }
        }
      }`;
      const data = await client.graphql<{
        metafieldsSet: { metafields: unknown[]; userErrors: { field: string[]; message: string }[] };
      }>(query, { metafields: [metafield] });
      if (data.metafieldsSet.userErrors.length > 0) {
        throw new Error(`metafieldsSet errors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data.metafieldsSet.metafields, null, 2) }],
      };
    }
  );

  // ── Delete a customer metafield ──────────────────────────────────
  server.tool(
    "delete_customer_metafield",
    "Delete a customer metafield by its GID or numeric ID.",
    {
      metafield_id: z.string().describe("The metafield GID or numeric ID."),
    },
    async ({ metafield_id }) => {
      const gid = metafield_id.startsWith("gid://") ? metafield_id : `gid://shopify/Metafield/${metafield_id}`;
      const query = `mutation ($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors { field message }
        }
      }`;
      const data = await client.graphql<{
        metafieldDelete: { deletedId: string; userErrors: { field: string[]; message: string }[] };
      }>(query, { input: { id: gid } });
      if (data.metafieldDelete.userErrors.length > 0) {
        throw new Error(`metafieldDelete errors: ${JSON.stringify(data.metafieldDelete.userErrors)}`);
      }
      return {
        content: [{ type: "text", text: `Metafield ${data.metafieldDelete.deletedId} deleted.` }],
      };
    }
  );
}
