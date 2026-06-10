import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";
import { compact, gid, searchQuery, throwOnUserErrors } from "./graphql-helpers.js";

const sortOrderSchema = z.enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"]);

const COLLECTION_FIELDS = `
  id
  title
  handle
  descriptionHtml
  updatedAt
  sortOrder
  productsCount { count }
  ruleSet { appliedDisjunctively rules { column relation condition } }
  image { url altText }
`;

function sortOrder(value?: z.infer<typeof sortOrderSchema>) {
  const map: Record<string, string> = {
    "alpha-asc": "ALPHA_ASC",
    "alpha-desc": "ALPHA_DESC",
    "best-selling": "BEST_SELLING",
    created: "CREATED",
    "created-desc": "CREATED_DESC",
    manual: "MANUAL",
    "price-asc": "PRICE_ASC",
    "price-desc": "PRICE_DESC",
  };
  return value ? map[value] : undefined;
}

function ruleColumn(value: string) {
  const map: Record<string, string> = {
    title: "TITLE",
    type: "TYPE",
    vendor: "VENDOR",
    tag: "TAG",
    variant_price: "VARIANT_PRICE",
    variant_weight: "VARIANT_WEIGHT",
    inventory_stock: "INVENTORY_STOCK",
    is_price_reduced: "IS_PRICE_REDUCED",
  };
  return map[value] ?? value.toUpperCase();
}

function ruleRelation(value: string) {
  const map: Record<string, string> = {
    equals: "EQUALS",
    not_equals: "NOT_EQUALS",
    greater_than: "GREATER_THAN",
    less_than: "LESS_THAN",
    starts_with: "STARTS_WITH",
    ends_with: "ENDS_WITH",
    contains: "CONTAINS",
    not_contains: "NOT_CONTAINS",
    is_set: "IS_SET",
    is_not_set: "IS_NOT_SET",
  };
  return map[value] ?? value.toUpperCase();
}

function collectionInput(fields: Record<string, unknown>) {
  const rules = fields.rules as { column: string; relation: string; condition: string }[] | undefined;
  return compact({
    id: fields.collection_id,
    title: fields.title,
    descriptionHtml: fields.body_html,
    sortOrder: sortOrder(fields.sort_order as z.infer<typeof sortOrderSchema> | undefined),
    image: fields.image_url ? { src: fields.image_url } : undefined,
    ruleSet: rules ? {
      appliedDisjunctively: fields.disjunctive ?? false,
      rules: rules.map((rule) => ({ column: ruleColumn(rule.column), relation: ruleRelation(rule.relation), condition: rule.condition })),
    } : undefined,
  });
}

async function listCollections(client: ShopifyClient, first: number, after: string | undefined, query: string | undefined) {
  const gql = `
    query ListCollections($first: Int!, $after: String, $query: String) {
      collections(first: $first, after: $after, query: $query) {
        nodes { ${COLLECTION_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  return client.graphql<{ collections: { nodes: unknown[]; pageInfo: unknown } }>(gql, { first, after: after ?? null, query: query ?? null });
}

async function getCollection(client: ShopifyClient, collectionId: string) {
  const query = `query GetCollection($id: ID!) { collection(id: $id) { ${COLLECTION_FIELDS} } }`;
  const data = await client.graphql<{ collection: unknown }>(query, { id: gid("Collection", collectionId) });
  return data.collection;
}

export function registerCollectionTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "list_custom_collections",
    "List custom (manual) collections. These are collections where the merchant manually selects which products to include.",
    {
      limit: z.number().min(1).max(250).default(250).describe("Number of collections to return (1-250). Default: 250."),
      since_id: z.string().optional().describe("Return collections after this ID."),
      title: z.string().optional().describe("Filter by exact title match."),
      product_id: z.string().optional().describe("Filter collections that contain this product ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, title, product_id, page_info }) => {
      const queryText = searchQuery({ collection_type: "custom", id: since_id ? `>${since_id}` : undefined, title, product_id: product_id ? gid("Product", product_id) : undefined });
      const data = await listCollections(client, limit, page_info, queryText);
      return { content: [{ type: "text", text: JSON.stringify({ custom_collections: data.collections.nodes, pageInfo: data.collections.pageInfo }, null, 2) }] };
    }
  );

  server.tool(
    "list_smart_collections",
    "List smart (automatic) collections. These are collections where products are automatically included based on rules.",
    {
      limit: z.number().min(1).max(250).default(250).describe("Number of collections to return (1-250). Default: 250."),
      since_id: z.string().optional().describe("Return collections after this ID."),
      title: z.string().optional().describe("Filter by exact title match."),
      product_id: z.string().optional().describe("Filter collections that contain this product ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, title, product_id, page_info }) => {
      const queryText = searchQuery({ collection_type: "smart", id: since_id ? `>${since_id}` : undefined, title, product_id: product_id ? gid("Product", product_id) : undefined });
      const data = await listCollections(client, limit, page_info, queryText);
      return { content: [{ type: "text", text: JSON.stringify({ smart_collections: data.collections.nodes, pageInfo: data.collections.pageInfo }, null, 2) }] };
    }
  );

  server.tool("get_custom_collection", "Get full details of a single custom collection by its ID.", { collection_id: z.string().describe("The numeric Shopify custom collection ID.") }, async ({ collection_id }) => ({ content: [{ type: "text", text: JSON.stringify(await getCollection(client, collection_id), null, 2) }] }));

  server.tool("get_smart_collection", "Get full details of a single smart collection by its ID, including its rules.", { collection_id: z.string().describe("The numeric Shopify smart collection ID.") }, async ({ collection_id }) => ({ content: [{ type: "text", text: JSON.stringify(await getCollection(client, collection_id), null, 2) }] }));

  server.tool(
    "create_custom_collection",
    "Create a new custom (manual) collection. Optionally include product IDs to add to it.",
    {
      title: z.string().describe("Collection title (required)."),
      body_html: z.string().optional().describe("Collection description in HTML."),
      published: z.boolean().default(true).describe("Whether the collection is visible. Default: true."),
      sort_order: sortOrderSchema.optional().describe("Sort order for products in the collection."),
      image_url: z.string().optional().describe("URL for the collection image."),
      collects: z.array(z.object({ product_id: z.string().describe("Product ID to add to this collection.") })).optional().describe("Products to include in the collection."),
    },
    async ({ title, body_html, sort_order, image_url, collects }) => {
      const mutation = `mutation CollectionCreate($input: CollectionInput!) { collectionCreate(input: $input) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ collectionCreate: { collection: { id: string } | null; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: collectionInput({ title, body_html, sort_order, image_url }) });
      throwOnUserErrors("collectionCreate", data.collectionCreate.userErrors);
      if (data.collectionCreate.collection && collects?.length) {
        const addMutation = `mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
        const added = await client.graphql<{ collectionAddProducts: { collection: unknown; userErrors: { field?: string[]; message: string }[] } }>(addMutation, {
          id: data.collectionCreate.collection.id,
          productIds: collects.map((collect) => gid("Product", collect.product_id)),
        });
        throwOnUserErrors("collectionAddProducts", added.collectionAddProducts.userErrors);
        return { content: [{ type: "text", text: JSON.stringify(added.collectionAddProducts.collection, null, 2) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data.collectionCreate.collection, null, 2) }] };
    }
  );

  server.tool(
    "update_custom_collection",
    "Update an existing custom collection. Only provided fields are changed.",
    {
      collection_id: z.string().describe("The numeric Shopify custom collection ID."),
      title: z.string().optional().describe("New title."),
      body_html: z.string().optional().describe("New HTML description."),
      published: z.boolean().optional().describe("Visibility."),
      sort_order: sortOrderSchema.optional().describe("New sort order."),
    },
    async ({ collection_id, ...fields }) => {
      const mutation = `mutation CollectionUpdate($input: CollectionInput!) { collectionUpdate(input: $input) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ collectionUpdate: { collection: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        input: collectionInput({ collection_id: gid("Collection", collection_id), ...fields }),
      });
      throwOnUserErrors("collectionUpdate", data.collectionUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.collectionUpdate.collection, null, 2) }] };
    }
  );

  server.tool("delete_custom_collection", "Permanently delete a custom collection. Products in it are NOT deleted.", { collection_id: z.string().describe("The numeric Shopify custom collection ID to delete.") }, async ({ collection_id }) => {
    const mutation = `mutation CollectionDelete($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }`;
    const data = await client.graphql<{ collectionDelete: { deletedCollectionId: string | null; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: { id: gid("Collection", collection_id) } });
    throwOnUserErrors("collectionDelete", data.collectionDelete.userErrors);
    return { content: [{ type: "text", text: `Custom collection ${data.collectionDelete.deletedCollectionId ?? collection_id} deleted successfully.` }] };
  });

  server.tool(
    "create_smart_collection",
    "Create a new smart (automatic) collection with rules that determine which products are included.",
    {
      title: z.string().describe("Collection title (required)."),
      body_html: z.string().optional().describe("Collection description in HTML."),
      published: z.boolean().default(true).describe("Whether the collection is visible. Default: true."),
      disjunctive: z.boolean().default(false).describe("If true, products matching ANY rule are included. If false (default), ALL rules must match."),
      sort_order: sortOrderSchema.optional().describe("Sort order for products in the collection."),
      rules: z.array(z.object({ column: z.enum(["title", "type", "vendor", "tag", "variant_price", "variant_weight", "inventory_stock", "is_price_reduced"]), relation: z.enum(["equals", "not_equals", "greater_than", "less_than", "starts_with", "ends_with", "contains", "not_contains", "is_set", "is_not_set"]), condition: z.string() })).optional().describe("Rules that determine which products are included."),
    },
    async ({ title, body_html, disjunctive, sort_order, rules }) => {
      const mutation = `mutation CollectionCreate($input: CollectionInput!) { collectionCreate(input: $input) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ collectionCreate: { collection: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: collectionInput({ title, body_html, disjunctive, sort_order, rules }) });
      throwOnUserErrors("collectionCreate", data.collectionCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.collectionCreate.collection, null, 2) }] };
    }
  );

  server.tool(
    "update_smart_collection",
    "Update a smart (automatic) collection's sort order or other metadata. Only provided fields are changed.",
    { collection_id: z.string().describe("The numeric Shopify smart collection ID."), title: z.string().optional().describe("New title."), body_html: z.string().optional().describe("New HTML description."), sort_order: sortOrderSchema.optional().describe("New sort order for products in this collection.") },
    async ({ collection_id, title, body_html, sort_order }) => {
      const mutation = `mutation CollectionUpdate($input: CollectionInput!) { collectionUpdate(input: $input) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
      const data = await client.graphql<{ collectionUpdate: { collection: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { input: collectionInput({ collection_id: gid("Collection", collection_id), title, body_html, sort_order }) });
      throwOnUserErrors("collectionUpdate", data.collectionUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.collectionUpdate.collection, null, 2) }] };
    }
  );

  server.tool(
    "reorder_collection_products",
    "Reorder products in a custom collection. Provide an ordered array of product IDs. The collection's sort_order must be 'manual' for positions to be honoured on the storefront.",
    { collection_id: z.string().describe("The numeric Shopify custom collection ID."), product_ids: z.array(z.string()).min(1).describe("Ordered list of product IDs.") },
    async ({ collection_id, product_ids }) => {
      const mutation = `mutation CollectionReorderProducts($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id done } userErrors { field message } } }`;
      const data = await client.graphql<{ collectionReorderProducts: { job: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, {
        id: gid("Collection", collection_id),
        moves: product_ids.map((productId, index) => ({ id: gid("Product", productId), newPosition: String(index) })),
      });
      throwOnUserErrors("collectionReorderProducts", data.collectionReorderProducts.userErrors);
      return { content: [{ type: "text", text: JSON.stringify({ reordered: product_ids.length, job: data.collectionReorderProducts.job }, null, 2) }] };
    }
  );

  server.tool("add_product_to_collection", "Add a product to a custom collection.", { product_id: z.string().describe("The product ID to add."), collection_id: z.string().describe("The custom collection ID to add the product to.") }, async ({ product_id, collection_id }) => {
    const mutation = `mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { ${COLLECTION_FIELDS} } userErrors { field message } } }`;
    const data = await client.graphql<{ collectionAddProducts: { collection: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("Collection", collection_id), productIds: [gid("Product", product_id)] });
    throwOnUserErrors("collectionAddProducts", data.collectionAddProducts.userErrors);
    return { content: [{ type: "text", text: JSON.stringify(data.collectionAddProducts.collection, null, 2) }] };
  });

  server.tool("remove_product_from_collection", "Remove a product from a custom collection.", { product_id: z.string().describe("The product ID to remove."), collection_id: z.string().describe("The custom collection ID to remove the product from.") }, async ({ product_id, collection_id }) => {
    const mutation = `mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) { collectionRemoveProducts(id: $id, productIds: $productIds) { job { id done } userErrors { field message } } }`;
    const data = await client.graphql<{ collectionRemoveProducts: { job: unknown; userErrors: { field?: string[]; message: string }[] } }>(mutation, { id: gid("Collection", collection_id), productIds: [gid("Product", product_id)] });
    throwOnUserErrors("collectionRemoveProducts", data.collectionRemoveProducts.userErrors);
    return { content: [{ type: "text", text: JSON.stringify(data.collectionRemoveProducts.job, null, 2) }] };
  });

  server.tool("list_collection_products", "List all products belonging to a specific collection (custom or smart).", { collection_id: z.string().describe("The collection ID."), limit: z.number().min(1).max(250).default(50).describe("Number of products to return (1-250). Default: 50."), page_info: z.string().optional().describe("Cursor for pagination.") }, async ({ collection_id, limit, page_info }) => {
    const query = `query ListCollectionProducts($id: ID!, $first: Int!, $after: String) { collection(id: $id) { products(first: $first, after: $after) { nodes { id title handle vendor productType status tags } pageInfo { hasNextPage endCursor } } } }`;
    const data = await client.graphql<{ collection: { products: { nodes: unknown[]; pageInfo: unknown } } }>(query, { id: gid("Collection", collection_id), first: limit, after: page_info ?? null });
    return { content: [{ type: "text", text: JSON.stringify({ products: data.collection.products.nodes, pageInfo: data.collection.products.pageInfo }, null, 2) }] };
  });
}