import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../shopify-client.js";

// ─── Shared helpers ──────────────────────────────────────────────────────────

const combinesWithSchema = z.object({
  orderDiscounts: z.boolean().optional().describe("Combine with order discounts."),
  productDiscounts: z.boolean().optional().describe("Combine with product discounts."),
  shippingDiscounts: z.boolean().optional().describe("Combine with shipping discounts."),
}).optional().describe("Discount classes this discount can combine with.");

function buildCombinesWith(c?: { orderDiscounts?: boolean; productDiscounts?: boolean; shippingDiscounts?: boolean }) {
  if (!c) return undefined;
  return {
    orderDiscounts: c.orderDiscounts ?? false,
    productDiscounts: c.productDiscounts ?? false,
    shippingDiscounts: c.shippingDiscounts ?? false,
  };
}

function buildDiscountItems(opts: { appliesToAll?: boolean; productIds?: string[]; collectionIds?: string[]; variantIds?: string[] }) {
  if (opts.appliesToAll === true) return { all: true };
  // If appliesToAll is undefined and no specific IDs are provided, default to all
  if (opts.appliesToAll === undefined && !opts.productIds?.length && !opts.collectionIds?.length && !opts.variantIds?.length) return { all: true };
  const result: Record<string, unknown> = {};
  if (opts.collectionIds?.length) result.collections = { add: opts.collectionIds };
  if (opts.productIds?.length || opts.variantIds?.length) {
    const products: Record<string, string[]> = {};
    if (opts.productIds?.length) products.productsToAdd = opts.productIds;
    if (opts.variantIds?.length) products.productVariantsToAdd = opts.variantIds;
    result.products = products;
  }
  return result;
}

function buildMinReq(subtotal?: number, quantity?: number) {
  if (subtotal !== undefined) return { subtotal: { greaterThanOrEqualToSubtotal: subtotal } };
  if (quantity !== undefined) return { quantity: { greaterThanOrEqualToQuantity: String(quantity) } };
  return undefined;
}

function throwOnUserErrors(errors: { field?: string[] | null; code?: string | null; message: string }[]) {
  if (errors.length > 0) throw new Error(`Shopify discount errors: ${JSON.stringify(errors)}`);
}

// Common inline fragment for listing discounts
const CODE_DISCOUNT_INLINE = `
  ... on DiscountCodeBasic { title status startsAt endsAt usageLimit appliesOncePerCustomer }
  ... on DiscountCodeBxgy { title status startsAt endsAt usesPerOrderLimit appliesOncePerCustomer }
  ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit appliesOncePerCustomer }
`;

const AUTO_DISCOUNT_INLINE = `
  ... on DiscountAutomaticBasic { title status startsAt endsAt }
  ... on DiscountAutomaticBxgy { title status startsAt endsAt usesPerOrderLimit }
  ... on DiscountAutomaticFreeShipping { title status startsAt endsAt }
`;

export function registerDiscountTools(server: McpServer, client: ShopifyClient) {
  // ── List price rules ──────────────────────────────────────────────
  server.tool(
    "list_price_rules",
    "List all price rules in the store. Price rules are the foundation for discount codes.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of price rules to return (1–250). Default: 10."),
      since_id: z.string().optional().describe("Return price rules after this ID."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ limit, since_id, page_info }) => {
      const data = await client.request<{ price_rules: unknown[] }>("price_rules.json", {
        params: { limit, since_id, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rules, null, 2) }],
      };
    }
  );

  // ── Get a price rule ──────────────────────────────────────────────
  server.tool(
    "get_price_rule",
    "Get full details of a single price rule by its ID.",
    {
      price_rule_id: z.string().describe("The numeric Shopify price rule ID."),
    },
    async ({ price_rule_id }) => {
      const data = await client.request<{ price_rule: unknown }>(`price_rules/${price_rule_id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Create a price rule ───────────────────────────────────────────
  server.tool(
    "create_price_rule",
    "Create a new price rule for discount codes. Supports percentage, fixed amount, or free shipping discounts.",
    {
      title: z.string().describe("Price rule title (internal name)."),
      target_type: z.enum(["line_item", "shipping_line"]).describe("What the discount applies to."),
      target_selection: z.enum(["all", "entitled"]).describe("Which items the discount targets."),
      allocation_method: z.enum(["across", "each"]).describe("How the discount is allocated: 'across' splits evenly, 'each' applies to each item."),
      value_type: z.enum(["percentage", "fixed_amount"]).describe("Type of discount value."),
      value: z.string().describe("Discount value (negative number, e.g. '-10.0' for 10% or $10 off)."),
      customer_selection: z.enum(["all", "prerequisite"]).default("all").describe("Which customers qualify. Default: all."),
      starts_at: z.string().describe("When the discount becomes active (ISO 8601)."),
      ends_at: z.string().optional().describe("When the discount expires (ISO 8601)."),
      usage_limit: z.number().optional().describe("Maximum total number of times the discount can be used."),
      once_per_customer: z.boolean().default(false).describe("Limit to one use per customer. Default: false."),
    },
    async ({ title, target_type, target_selection, allocation_method, value_type, value, customer_selection, starts_at, ends_at, usage_limit, once_per_customer }) => {
      const price_rule: Record<string, unknown> = {
        title, target_type, target_selection, allocation_method, value_type, value, customer_selection, starts_at, once_per_customer,
      };
      if (ends_at) price_rule.ends_at = ends_at;
      if (usage_limit !== undefined) price_rule.usage_limit = usage_limit;
      const data = await client.request<{ price_rule: unknown }>("price_rules.json", {
        method: "POST",
        body: { price_rule },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Update a price rule ───────────────────────────────────────────
  server.tool(
    "update_price_rule",
    "Update an existing price rule. Only provided fields are changed.",
    {
      price_rule_id: z.string().describe("The numeric price rule ID."),
      title: z.string().optional().describe("New title."),
      value: z.string().optional().describe("New discount value."),
      starts_at: z.string().optional().describe("New start date."),
      ends_at: z.string().optional().describe("New end date."),
      usage_limit: z.number().optional().describe("New usage limit."),
      once_per_customer: z.boolean().optional().describe("Limit one per customer."),
    },
    async ({ price_rule_id, ...fields }) => {
      const price_rule: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) price_rule[k] = v;
      }
      const data = await client.request<{ price_rule: unknown }>(`price_rules/${price_rule_id}.json`, {
        method: "PUT",
        body: { price_rule },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.price_rule, null, 2) }],
      };
    }
  );

  // ── Delete a price rule ───────────────────────────────────────────
  server.tool(
    "delete_price_rule",
    "Permanently delete a price rule and all its associated discount codes.",
    {
      price_rule_id: z.string().describe("The numeric price rule ID to delete."),
    },
    async ({ price_rule_id }) => {
      await client.request(`price_rules/${price_rule_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Price rule ${price_rule_id} deleted successfully.` }],
      };
    }
  );

  // ── List discount codes for a price rule ──────────────────────────
  server.tool(
    "list_discount_codes",
    "List all discount codes for a specific price rule.",
    {
      price_rule_id: z.string().describe("The price rule ID."),
      limit: z.number().min(1).max(250).default(50).describe("Number of codes to return. Default: 50."),
      page_info: z.string().optional().describe("Cursor for pagination."),
    },
    async ({ price_rule_id, limit, page_info }) => {
      const data = await client.request<{ discount_codes: unknown[] }>(`price_rules/${price_rule_id}/discount_codes.json`, {
        params: { limit, page_info },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.discount_codes, null, 2) }],
      };
    }
  );

  // ── Create a discount code ────────────────────────────────────────
  server.tool(
    "create_discount_code",
    "Create a new discount code for a price rule.",
    {
      price_rule_id: z.string().describe("The price rule ID this code belongs to."),
      code: z.string().describe("The discount code string that customers enter at checkout (e.g. 'SAVE10')."),
    },
    async ({ price_rule_id, code }) => {
      const data = await client.request<{ discount_code: unknown }>(`price_rules/${price_rule_id}/discount_codes.json`, {
        method: "POST",
        body: { discount_code: { code } },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.discount_code, null, 2) }],
      };
    }
  );

  // ── Delete a discount code ────────────────────────────────────────
  server.tool(
    "delete_discount_code",
    "Delete a discount code.",
    {
      price_rule_id: z.string().describe("The price rule ID."),
      discount_code_id: z.string().describe("The discount code ID to delete."),
    },
    async ({ price_rule_id, discount_code_id }) => {
      await client.request(`price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Discount code ${discount_code_id} deleted successfully.` }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPHQL CODE DISCOUNTS (modern API)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List code discounts ────────────────────────────────────────────────────
  server.tool(
    "list_code_discounts",
    "List code discounts using the GraphQL API. Returns basic, BXGY, and free shipping code discounts. Supports filtering by status, type, and text search.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of discounts to return. Default: 10."),
      after: z.string().optional().describe("Cursor for forward pagination (endCursor from previous page)."),
      query: z.string().optional().describe("Filter query, e.g. 'status:active', 'type:percentage', 'title:SALE'."),
    },
    async ({ limit, after, query }) => {
      const gql = `
        query ListCodeDiscounts($first: Int!, $after: String, $query: String) {
          codeDiscountNodes(first: $first, after: $after, query: $query) {
            nodes {
              id
              codeDiscount {
                ${CODE_DISCOUNT_INLINE}
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await client.graphql<{ codeDiscountNodes: { nodes: unknown[]; pageInfo: unknown } }>(gql, { first: limit, after: after ?? null, query: query ?? null });
      return { content: [{ type: "text", text: JSON.stringify(data.codeDiscountNodes, null, 2) }] };
    }
  );

  // ── Get code discount ──────────────────────────────────────────────────────
  server.tool(
    "get_code_discount",
    "Get a code discount by its GID (e.g. 'gid://shopify/DiscountCodeNode/123') or by the code string customers enter at checkout.",
    {
      id: z.string().optional().describe("GID of the discount node (e.g. 'gid://shopify/DiscountCodeNode/123')."),
      code: z.string().optional().describe("The customer-facing discount code string (e.g. 'SAVE10')."),
    },
    async ({ id, code }) => {
      if (!id && !code) throw new Error("Provide either id or code.");
      if (code) {
        const gql = `
          query GetCodeDiscountByCode($code: String!) {
            codeDiscountNodeByCode(code: $code) {
              id
              codeDiscount {
                ${CODE_DISCOUNT_INLINE}
              }
            }
          }
        `;
        const data = await client.graphql<{ codeDiscountNodeByCode: unknown }>(gql, { code });
        return { content: [{ type: "text", text: JSON.stringify(data.codeDiscountNodeByCode, null, 2) }] };
      }
      const gql = `
        query GetDiscountNode($id: ID!) {
          discountNode(id: $id) {
            id
            discount {
              ${CODE_DISCOUNT_INLINE}
            }
          }
        }
      `;
      const data = await client.graphql<{ discountNode: unknown }>(gql, { id });
      return { content: [{ type: "text", text: JSON.stringify(data.discountNode, null, 2) }] };
    }
  );

  // ── Create basic code discount ─────────────────────────────────────────────
  server.tool(
    "create_code_discount_basic",
    "Create an amount-off code discount (percentage or fixed) that customers apply at checkout. Supports product/collection targeting, minimum requirements, and combination rules.",
    {
      title: z.string().describe("Internal name shown in admin."),
      code: z.string().describe("Code customers enter at checkout (e.g. 'SAVE10')."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional().describe("Expiry date (ISO 8601)."),
      usageLimit: z.number().optional().describe("Max total redemptions. Omit for unlimited."),
      appliesOncePerCustomer: z.boolean().optional().describe("Limit one use per customer. Default: false."),
      discountType: z.enum(["percentage", "fixed_amount"]).describe("Type of discount."),
      discountValue: z.number().describe("Percentage (0–100, e.g. 10 for 10%) or fixed dollar amount (e.g. 10)."),
      appliesOnEachItem: z.boolean().optional().describe("For fixed_amount: apply to each eligible item. Default: false."),
      appliesToAll: z.boolean().optional().describe("Apply to all products. Default: true."),
      productIds: z.array(z.string()).optional().describe("GIDs of products to target (e.g. 'gid://shopify/Product/123')."),
      collectionIds: z.array(z.string()).optional().describe("GIDs of collections to target."),
      variantIds: z.array(z.string()).optional().describe("GIDs of product variants to target."),
      minimumSubtotal: z.number().optional().describe("Minimum order subtotal required (e.g. 50 for $50)."),
      minimumQuantity: z.number().optional().describe("Minimum quantity of items required."),
      combinesWith: combinesWithSchema,
    },
    async ({ title, code, startsAt, endsAt, usageLimit, appliesOncePerCustomer, discountType, discountValue, appliesOnEachItem, appliesToAll, productIds, collectionIds, variantIds, minimumSubtotal, minimumQuantity, combinesWith }) => {
      const value = discountType === "percentage"
        ? { percentage: discountValue / 100 }
        : { discountAmount: { amount: String(discountValue), appliesOnEachItem: appliesOnEachItem ?? false } };

      const input: Record<string, unknown> = {
        title,
        code,
        startsAt,
        customerSelection: { all: true },
        customerGets: {
          value,
          items: buildDiscountItems({ appliesToAll, productIds, collectionIds, variantIds }),
        },
      };
      if (endsAt) input.endsAt = endsAt;
      if (usageLimit !== undefined) input.usageLimit = usageLimit;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateCodeDiscountBasic($input: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic { title status startsAt endsAt usageLimit appliesOncePerCustomer codes(first: 5) { nodes { code id } } }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeBasicCreate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountCodeBasicCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeBasicCreate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Update basic code discount ─────────────────────────────────────────────
  server.tool(
    "update_code_discount_basic",
    "Update an existing basic (amount-off) code discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the discount node (e.g. 'gid://shopify/DiscountCodeNode/123')."),
      title: z.string().optional(),
      code: z.string().optional().describe("New code for the discount."),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      usageLimit: z.number().optional(),
      appliesOncePerCustomer: z.boolean().optional(),
      discountType: z.enum(["percentage", "fixed_amount"]).optional(),
      discountValue: z.number().optional(),
      appliesOnEachItem: z.boolean().optional(),
      appliesToAll: z.boolean().optional(),
      productIds: z.array(z.string()).optional(),
      collectionIds: z.array(z.string()).optional(),
      variantIds: z.array(z.string()).optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, code, startsAt, endsAt, usageLimit, appliesOncePerCustomer, discountType, discountValue, appliesOnEachItem, appliesToAll, productIds, collectionIds, variantIds, minimumSubtotal, minimumQuantity, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (code) input.code = code;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (usageLimit !== undefined) input.usageLimit = usageLimit;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      if (discountType && discountValue !== undefined) {
        input.customerGets = {
          value: discountType === "percentage"
            ? { percentage: discountValue / 100 }
            : { discountAmount: { amount: String(discountValue), appliesOnEachItem: appliesOnEachItem ?? false } },
          items: buildDiscountItems({ appliesToAll, productIds, collectionIds, variantIds }),
        };
      }
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateCodeDiscountBasic($id: ID!, $input: DiscountCodeBasicInput!) {
          discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic { title status startsAt endsAt usageLimit appliesOncePerCustomer }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeBasicUpdate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountCodeBasicUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeBasicUpdate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Create BXGY code discount ──────────────────────────────────────────────
  server.tool(
    "create_code_discount_bxgy",
    "Create a Buy X Get Y (BXGY) code discount. Customers enter a code to get a discount when they buy specified items.",
    {
      title: z.string().describe("Internal name shown in admin."),
      code: z.string().describe("Code customers enter at checkout."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional(),
      appliesOncePerCustomer: z.boolean().optional(),
      usesPerOrderLimit: z.number().optional().describe("Max times this discount applies per order."),
      buyQuantity: z.string().describe("Number of items customer must buy (e.g. '3')."),
      buyAll: z.boolean().optional().describe("Buy items from all products. Default: true if no buyProductIds/buyCollectionIds."),
      buyProductIds: z.array(z.string()).optional().describe("GIDs of products customer must buy."),
      buyCollectionIds: z.array(z.string()).optional().describe("GIDs of collections customer must buy from."),
      getQuantity: z.string().describe("Number of items customer gets at a discount (e.g. '1')."),
      getAll: z.boolean().optional().describe("Get discount on any product. Default: true if no getProductIds/getCollectionIds."),
      getProductIds: z.array(z.string()).optional().describe("GIDs of products customer gets."),
      getCollectionIds: z.array(z.string()).optional().describe("GIDs of collections customer gets from."),
      getDiscountType: z.enum(["percentage", "free"]).describe("Type of discount applied to the 'get' items."),
      getDiscountPercentage: z.number().optional().describe("Percentage off (0–100, e.g. 20 for 20%). Required when getDiscountType is 'percentage'."),
      combinesWith: combinesWithSchema,
    },
    async ({ title, code, startsAt, endsAt, appliesOncePerCustomer, usesPerOrderLimit, buyQuantity, buyAll, buyProductIds, buyCollectionIds, getQuantity, getAll, getProductIds, getCollectionIds, getDiscountType, getDiscountPercentage, combinesWith }) => {
      const buyItems = buildDiscountItems({ appliesToAll: buyAll ?? (!buyProductIds?.length && !buyCollectionIds?.length), productIds: buyProductIds, collectionIds: buyCollectionIds });
      const getItems = buildDiscountItems({ appliesToAll: getAll ?? (!getProductIds?.length && !getCollectionIds?.length), productIds: getProductIds, collectionIds: getCollectionIds });

      const getEffect = getDiscountType === "free"
        ? { percentage: 1.0 }
        : { percentage: (getDiscountPercentage ?? 0) / 100 };

      const input: Record<string, unknown> = {
        title,
        code,
        startsAt,
        customerSelection: { all: true },
        customerBuys: {
          items: buyItems,
          value: { quantity: buyQuantity },
        },
        customerGets: {
          items: getItems,
          value: {
            discountOnQuantity: {
              quantity: getQuantity,
              effect: getEffect,
            },
          },
        },
      };
      if (endsAt) input.endsAt = endsAt;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      if (usesPerOrderLimit !== undefined) input.usesPerOrderLimit = String(usesPerOrderLimit);
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateCodeDiscountBxgy($input: DiscountCodeBxgyInput!) {
          discountCodeBxgyCreate(bxgyCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBxgy { title status startsAt endsAt usesPerOrderLimit appliesOncePerCustomer codes(first: 5) { nodes { code id } } }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeBxgyCreate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountCodeBxgyCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeBxgyCreate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Update BXGY code discount ──────────────────────────────────────────────
  server.tool(
    "update_code_discount_bxgy",
    "Update an existing BXGY code discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the discount node."),
      title: z.string().optional(),
      code: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      appliesOncePerCustomer: z.boolean().optional(),
      usesPerOrderLimit: z.number().optional(),
      buyQuantity: z.string().optional(),
      buyAll: z.boolean().optional(),
      buyProductIds: z.array(z.string()).optional(),
      buyCollectionIds: z.array(z.string()).optional(),
      getQuantity: z.string().optional(),
      getAll: z.boolean().optional(),
      getProductIds: z.array(z.string()).optional(),
      getCollectionIds: z.array(z.string()).optional(),
      getDiscountType: z.enum(["percentage", "free"]).optional(),
      getDiscountPercentage: z.number().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, code, startsAt, endsAt, appliesOncePerCustomer, usesPerOrderLimit, buyQuantity, buyAll, buyProductIds, buyCollectionIds, getQuantity, getAll, getProductIds, getCollectionIds, getDiscountType, getDiscountPercentage, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (code) input.code = code;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      if (usesPerOrderLimit !== undefined) input.usesPerOrderLimit = String(usesPerOrderLimit);
      const hasBuyItems = buyAll !== undefined || !!buyProductIds?.length || !!buyCollectionIds?.length;
      if (buyQuantity) {
        input.customerBuys = {
          items: hasBuyItems ? buildDiscountItems({ appliesToAll: buyAll, productIds: buyProductIds, collectionIds: buyCollectionIds }) : undefined,
          value: { quantity: buyQuantity },
        };
        if ((input.customerBuys as Record<string, unknown>).items === undefined) {
          delete (input.customerBuys as Record<string, unknown>).items;
        }
      }
      const hasGetItems = getAll !== undefined || !!getProductIds?.length || !!getCollectionIds?.length;
      if (getQuantity && getDiscountType) {
        const getEffect = getDiscountType === "free"
          ? { percentage: 1.0 }
          : { percentage: (getDiscountPercentage ?? 0) / 100 };
        input.customerGets = {
          items: hasGetItems ? buildDiscountItems({ appliesToAll: getAll, productIds: getProductIds, collectionIds: getCollectionIds }) : undefined,
          value: { discountOnQuantity: { quantity: getQuantity, effect: getEffect } },
        };
        if ((input.customerGets as Record<string, unknown>).items === undefined) {
          delete (input.customerGets as Record<string, unknown>).items;
        }
      }
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateCodeDiscountBxgy($id: ID!, $input: DiscountCodeBxgyInput!) {
          discountCodeBxgyUpdate(id: $id, bxgyCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBxgy { title status startsAt endsAt usesPerOrderLimit }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeBxgyUpdate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountCodeBxgyUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeBxgyUpdate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Create free shipping code discount ────────────────────────────────────
  server.tool(
    "create_code_discount_free_shipping",
    "Create a free shipping code discount. Customers enter a code to get free (or discounted) shipping.",
    {
      title: z.string().describe("Internal name shown in admin."),
      code: z.string().describe("Code customers enter at checkout."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional(),
      usageLimit: z.number().optional(),
      appliesOncePerCustomer: z.boolean().optional(),
      destinationAll: z.boolean().optional().describe("Apply to all shipping destinations. Default: true."),
      countryCodes: z.array(z.string()).optional().describe("ISO country codes to restrict shipping destination (e.g. ['US', 'CA'])."),
      includeRestOfWorld: z.boolean().optional().describe("Include rest of world when countryCodes is set."),
      minimumSubtotal: z.number().optional().describe("Minimum order subtotal (e.g. 50 for $50)."),
      minimumQuantity: z.number().optional(),
      maximumShippingPrice: z.string().optional().describe("Max shipping rate this discount applies to (e.g. '10.00')."),
      combinesWith: combinesWithSchema,
    },
    async ({ title, code, startsAt, endsAt, usageLimit, appliesOncePerCustomer, destinationAll, countryCodes, includeRestOfWorld, minimumSubtotal, minimumQuantity, maximumShippingPrice, combinesWith }) => {
      const destination = (destinationAll !== false && !countryCodes?.length)
        ? { all: true }
        : { countries: { add: countryCodes ?? [], includeRestOfWorld: includeRestOfWorld ?? false } };

      const input: Record<string, unknown> = {
        title,
        code,
        startsAt,
        customerSelection: { all: true },
        destination,
      };
      if (endsAt) input.endsAt = endsAt;
      if (usageLimit !== undefined) input.usageLimit = usageLimit;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      if (maximumShippingPrice) input.maximumShippingPrice = maximumShippingPrice;
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateCodeDiscountFreeShipping($input: DiscountCodeFreeShippingInput!) {
          discountCodeFreeShippingCreate(freeShippingCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit appliesOncePerCustomer codes(first: 5) { nodes { code id } } }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeFreeShippingCreate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountCodeFreeShippingCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeFreeShippingCreate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Update free shipping code discount ────────────────────────────────────
  server.tool(
    "update_code_discount_free_shipping",
    "Update an existing free shipping code discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the discount node."),
      title: z.string().optional(),
      code: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      usageLimit: z.number().optional(),
      appliesOncePerCustomer: z.boolean().optional(),
      destinationAll: z.boolean().optional(),
      countryCodes: z.array(z.string()).optional(),
      includeRestOfWorld: z.boolean().optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      maximumShippingPrice: z.string().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, code, startsAt, endsAt, usageLimit, appliesOncePerCustomer, destinationAll, countryCodes, includeRestOfWorld, minimumSubtotal, minimumQuantity, maximumShippingPrice, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (code) input.code = code;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (usageLimit !== undefined) input.usageLimit = usageLimit;
      if (appliesOncePerCustomer !== undefined) input.appliesOncePerCustomer = appliesOncePerCustomer;
      if (maximumShippingPrice) input.maximumShippingPrice = maximumShippingPrice;
      if (destinationAll !== undefined || countryCodes?.length) {
        input.destination = (destinationAll !== false && !countryCodes?.length)
          ? { all: true }
          : { countries: { add: countryCodes ?? [], includeRestOfWorld: includeRestOfWorld ?? false } };
      }
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateCodeDiscountFreeShipping($id: ID!, $input: DiscountCodeFreeShippingInput!) {
          discountCodeFreeShippingUpdate(id: $id, freeShippingCodeDiscount: $input) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeFreeShippingUpdate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountCodeFreeShippingUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeFreeShippingUpdate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Activate code discount ─────────────────────────────────────────────────
  server.tool(
    "activate_code_discount",
    "Activate a code discount that is currently inactive or scheduled.",
    {
      id: z.string().describe("GID of the discount node (e.g. 'gid://shopify/DiscountCodeNode/123')."),
    },
    async ({ id }) => {
      const gql = `
        mutation ActivateCodeDiscount($id: ID!) {
          discountCodeActivate(id: $id) {
            codeDiscountNode {
              id
              codeDiscount {
                ${CODE_DISCOUNT_INLINE}
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeActivate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountCodeActivate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeActivate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Deactivate code discount ───────────────────────────────────────────────
  server.tool(
    "deactivate_code_discount",
    "Deactivate (pause) a code discount without deleting it.",
    {
      id: z.string().describe("GID of the discount node."),
    },
    async ({ id }) => {
      const gql = `
        mutation DeactivateCodeDiscount($id: ID!) {
          discountCodeDeactivate(id: $id) {
            codeDiscountNode {
              id
              codeDiscount {
                ${CODE_DISCOUNT_INLINE}
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeDeactivate: { codeDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountCodeDeactivate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountCodeDeactivate.codeDiscountNode, null, 2) }] };
    }
  );

  // ── Delete code discount ───────────────────────────────────────────────────
  server.tool(
    "delete_code_discount",
    "Permanently delete a code discount by its GID. This cannot be undone.",
    {
      id: z.string().describe("GID of the discount node to delete (e.g. 'gid://shopify/DiscountCodeNode/123')."),
    },
    async ({ id }) => {
      const gql = `
        mutation DeleteCodeDiscount($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountCodeDelete: { deletedCodeDiscountId: string | null; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountCodeDelete.userErrors);
      return { content: [{ type: "text", text: `Code discount ${data.discountCodeDelete.deletedCodeDiscountId} deleted successfully.` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPHQL AUTOMATIC DISCOUNTS (modern API)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List automatic discounts ───────────────────────────────────────────────
  server.tool(
    "list_automatic_discounts",
    "List automatic discounts (applied without a code) using the GraphQL API. Supports filtering by status, type, and text search.",
    {
      limit: z.number().min(1).max(250).default(10).describe("Number of discounts to return. Default: 10."),
      after: z.string().optional().describe("Cursor for forward pagination."),
      query: z.string().optional().describe("Filter query, e.g. 'status:active', 'type:bxgy'."),
    },
    async ({ limit, after, query }) => {
      const gql = `
        query ListAutomaticDiscounts($first: Int!, $after: String, $query: String) {
          automaticDiscountNodes(first: $first, after: $after, query: $query) {
            nodes {
              id
              automaticDiscount {
                ${AUTO_DISCOUNT_INLINE}
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await client.graphql<{ automaticDiscountNodes: { nodes: unknown[]; pageInfo: unknown } }>(gql, { first: limit, after: after ?? null, query: query ?? null });
      return { content: [{ type: "text", text: JSON.stringify(data.automaticDiscountNodes, null, 2) }] };
    }
  );

  // ── Get automatic discount ─────────────────────────────────────────────────
  server.tool(
    "get_automatic_discount",
    "Get an automatic discount by its GID (e.g. 'gid://shopify/DiscountAutomaticNode/123').",
    {
      id: z.string().describe("GID of the automatic discount node."),
    },
    async ({ id }) => {
      const gql = `
        query GetAutomaticDiscount($id: ID!) {
          automaticDiscountNode(id: $id) {
            id
            automaticDiscount {
              ${AUTO_DISCOUNT_INLINE}
            }
          }
        }
      `;
      const data = await client.graphql<{ automaticDiscountNode: unknown }>(gql, { id });
      return { content: [{ type: "text", text: JSON.stringify(data.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Create basic automatic discount ───────────────────────────────────────
  server.tool(
    "create_automatic_discount_basic",
    "Create an automatic amount-off discount (percentage or fixed) that's applied without a code when cart meets criteria.",
    {
      title: z.string().describe("Name shown to customers and in admin."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional(),
      discountType: z.enum(["percentage", "fixed_amount"]).describe("Type of discount."),
      discountValue: z.number().describe("Percentage (0–100) or fixed dollar amount."),
      appliesOnEachItem: z.boolean().optional().describe("For fixed_amount: apply to each item. Default: false."),
      appliesToAll: z.boolean().optional().describe("Apply to all products. Default: true."),
      productIds: z.array(z.string()).optional(),
      collectionIds: z.array(z.string()).optional(),
      variantIds: z.array(z.string()).optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ title, startsAt, endsAt, discountType, discountValue, appliesOnEachItem, appliesToAll, productIds, collectionIds, variantIds, minimumSubtotal, minimumQuantity, combinesWith }) => {
      const value = discountType === "percentage"
        ? { percentage: discountValue / 100 }
        : { discountAmount: { amount: String(discountValue), appliesOnEachItem: appliesOnEachItem ?? false } };

      const input: Record<string, unknown> = {
        title,
        startsAt,
        customerGets: {
          value,
          items: buildDiscountItems({ appliesToAll, productIds, collectionIds, variantIds }),
        },
      };
      if (endsAt) input.endsAt = endsAt;
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateAutomaticDiscountBasic($input: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic { title status startsAt endsAt }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticBasicCreate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountAutomaticBasicCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticBasicCreate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Update basic automatic discount ───────────────────────────────────────
  server.tool(
    "update_automatic_discount_basic",
    "Update an existing basic automatic discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the automatic discount node."),
      title: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      discountType: z.enum(["percentage", "fixed_amount"]).optional(),
      discountValue: z.number().optional(),
      appliesOnEachItem: z.boolean().optional(),
      appliesToAll: z.boolean().optional(),
      productIds: z.array(z.string()).optional(),
      collectionIds: z.array(z.string()).optional(),
      variantIds: z.array(z.string()).optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, startsAt, endsAt, discountType, discountValue, appliesOnEachItem, appliesToAll, productIds, collectionIds, variantIds, minimumSubtotal, minimumQuantity, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (discountType && discountValue !== undefined) {
        input.customerGets = {
          value: discountType === "percentage"
            ? { percentage: discountValue / 100 }
            : { discountAmount: { amount: String(discountValue), appliesOnEachItem: appliesOnEachItem ?? false } },
          items: buildDiscountItems({ appliesToAll, productIds, collectionIds, variantIds }),
        };
      }
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateAutomaticDiscountBasic($id: ID!, $input: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic { title status startsAt endsAt }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticBasicUpdate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountAutomaticBasicUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticBasicUpdate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Create BXGY automatic discount ────────────────────────────────────────
  server.tool(
    "create_automatic_discount_bxgy",
    "Create an automatic Buy X Get Y discount applied without a code.",
    {
      title: z.string().describe("Name shown to customers and in admin."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional(),
      usesPerOrderLimit: z.number().optional(),
      buyQuantity: z.string().describe("Number of items customer must buy (e.g. '3')."),
      buyAll: z.boolean().optional(),
      buyProductIds: z.array(z.string()).optional(),
      buyCollectionIds: z.array(z.string()).optional(),
      getQuantity: z.string().describe("Number of items customer gets at a discount (e.g. '1')."),
      getAll: z.boolean().optional(),
      getProductIds: z.array(z.string()).optional(),
      getCollectionIds: z.array(z.string()).optional(),
      getDiscountType: z.enum(["percentage", "free"]).describe("Type of discount on 'get' items."),
      getDiscountPercentage: z.number().optional().describe("Percentage off (0–100). Required when getDiscountType is 'percentage'."),
      combinesWith: combinesWithSchema,
    },
    async ({ title, startsAt, endsAt, usesPerOrderLimit, buyQuantity, buyAll, buyProductIds, buyCollectionIds, getQuantity, getAll, getProductIds, getCollectionIds, getDiscountType, getDiscountPercentage, combinesWith }) => {
      const buyItems = buildDiscountItems({ appliesToAll: buyAll ?? (!buyProductIds?.length && !buyCollectionIds?.length), productIds: buyProductIds, collectionIds: buyCollectionIds });
      const getItems = buildDiscountItems({ appliesToAll: getAll ?? (!getProductIds?.length && !getCollectionIds?.length), productIds: getProductIds, collectionIds: getCollectionIds });
      const getEffect = getDiscountType === "free"
        ? { percentage: 1.0 }
        : { percentage: (getDiscountPercentage ?? 0) / 100 };

      const input: Record<string, unknown> = {
        title,
        startsAt,
        customerBuys: { items: buyItems, value: { quantity: buyQuantity } },
        customerGets: { items: getItems, value: { discountOnQuantity: { quantity: getQuantity, effect: getEffect } } },
      };
      if (endsAt) input.endsAt = endsAt;
      if (usesPerOrderLimit !== undefined) input.usesPerOrderLimit = String(usesPerOrderLimit);
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateAutomaticDiscountBxgy($input: DiscountAutomaticBxgyInput!) {
          discountAutomaticBxgyCreate(automaticBxgyDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBxgy { title status startsAt endsAt usesPerOrderLimit }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticBxgyCreate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountAutomaticBxgyCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticBxgyCreate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Update BXGY automatic discount ────────────────────────────────────────
  server.tool(
    "update_automatic_discount_bxgy",
    "Update an existing automatic BXGY discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the automatic discount node."),
      title: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      usesPerOrderLimit: z.number().optional(),
      buyQuantity: z.string().optional(),
      buyAll: z.boolean().optional(),
      buyProductIds: z.array(z.string()).optional(),
      buyCollectionIds: z.array(z.string()).optional(),
      getQuantity: z.string().optional(),
      getAll: z.boolean().optional(),
      getProductIds: z.array(z.string()).optional(),
      getCollectionIds: z.array(z.string()).optional(),
      getDiscountType: z.enum(["percentage", "free"]).optional(),
      getDiscountPercentage: z.number().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, startsAt, endsAt, usesPerOrderLimit, buyQuantity, buyAll, buyProductIds, buyCollectionIds, getQuantity, getAll, getProductIds, getCollectionIds, getDiscountType, getDiscountPercentage, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (usesPerOrderLimit !== undefined) input.usesPerOrderLimit = String(usesPerOrderLimit);
      const hasBuyItems = buyAll !== undefined || !!buyProductIds?.length || !!buyCollectionIds?.length;
      if (buyQuantity) {
        input.customerBuys = {
          items: hasBuyItems ? buildDiscountItems({ appliesToAll: buyAll, productIds: buyProductIds, collectionIds: buyCollectionIds }) : undefined,
          value: { quantity: buyQuantity },
        };
        if ((input.customerBuys as Record<string, unknown>).items === undefined) {
          delete (input.customerBuys as Record<string, unknown>).items;
        }
      }
      const hasGetItems = getAll !== undefined || !!getProductIds?.length || !!getCollectionIds?.length;
      if (getQuantity && getDiscountType) {
        const getEffect = getDiscountType === "free"
          ? { percentage: 1.0 }
          : { percentage: (getDiscountPercentage ?? 0) / 100 };
        input.customerGets = {
          items: hasGetItems ? buildDiscountItems({ appliesToAll: getAll, productIds: getProductIds, collectionIds: getCollectionIds }) : undefined,
          value: { discountOnQuantity: { quantity: getQuantity, effect: getEffect } },
        };
        if ((input.customerGets as Record<string, unknown>).items === undefined) {
          delete (input.customerGets as Record<string, unknown>).items;
        }
      }
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateAutomaticDiscountBxgy($id: ID!, $input: DiscountAutomaticBxgyInput!) {
          discountAutomaticBxgyUpdate(id: $id, automaticBxgyDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBxgy { title status startsAt endsAt usesPerOrderLimit }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticBxgyUpdate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountAutomaticBxgyUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticBxgyUpdate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Create free shipping automatic discount ───────────────────────────────
  server.tool(
    "create_automatic_discount_free_shipping",
    "Create an automatic free shipping discount applied without a code when order meets criteria.",
    {
      title: z.string().describe("Name shown to customers and in admin."),
      startsAt: z.string().describe("Activation date (ISO 8601)."),
      endsAt: z.string().optional(),
      destinationAll: z.boolean().optional().describe("Apply to all destinations. Default: true."),
      countryCodes: z.array(z.string()).optional().describe("ISO country codes (e.g. ['US', 'CA'])."),
      includeRestOfWorld: z.boolean().optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      maximumShippingPrice: z.string().optional().describe("Max shipping rate covered (e.g. '10.00')."),
      combinesWith: combinesWithSchema,
    },
    async ({ title, startsAt, endsAt, destinationAll, countryCodes, includeRestOfWorld, minimumSubtotal, minimumQuantity, maximumShippingPrice, combinesWith }) => {
      const destination = (destinationAll !== false && !countryCodes?.length)
        ? { all: true }
        : { countries: { add: countryCodes ?? [], includeRestOfWorld: includeRestOfWorld ?? false } };

      const input: Record<string, unknown> = { title, startsAt, destination };
      if (endsAt) input.endsAt = endsAt;
      if (maximumShippingPrice) input.maximumShippingPrice = maximumShippingPrice;
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation CreateAutomaticDiscountFreeShipping($input: DiscountAutomaticFreeShippingInput!) {
          discountAutomaticFreeShippingCreate(freeShippingAutomaticDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticFreeShipping { title status startsAt endsAt }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticFreeShippingCreate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { input });
      throwOnUserErrors(data.discountAutomaticFreeShippingCreate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticFreeShippingCreate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Update free shipping automatic discount ───────────────────────────────
  server.tool(
    "update_automatic_discount_free_shipping",
    "Update an existing automatic free shipping discount. Only provided fields are changed.",
    {
      id: z.string().describe("GID of the automatic discount node."),
      title: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      destinationAll: z.boolean().optional(),
      countryCodes: z.array(z.string()).optional(),
      includeRestOfWorld: z.boolean().optional(),
      minimumSubtotal: z.number().optional(),
      minimumQuantity: z.number().optional(),
      maximumShippingPrice: z.string().optional(),
      combinesWith: combinesWithSchema,
    },
    async ({ id, title, startsAt, endsAt, destinationAll, countryCodes, includeRestOfWorld, minimumSubtotal, minimumQuantity, maximumShippingPrice, combinesWith }) => {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (startsAt) input.startsAt = startsAt;
      if (endsAt !== undefined) input.endsAt = endsAt;
      if (maximumShippingPrice) input.maximumShippingPrice = maximumShippingPrice;
      if (destinationAll !== undefined || countryCodes?.length) {
        input.destination = (destinationAll !== false && !countryCodes?.length)
          ? { all: true }
          : { countries: { add: countryCodes ?? [], includeRestOfWorld: includeRestOfWorld ?? false } };
      }
      const minReq = buildMinReq(minimumSubtotal, minimumQuantity);
      if (minReq) input.minimumRequirement = minReq;
      const cw = buildCombinesWith(combinesWith);
      if (cw) input.combinesWith = cw;

      const gql = `
        mutation UpdateAutomaticDiscountFreeShipping($id: ID!, $input: DiscountAutomaticFreeShippingInput!) {
          discountAutomaticFreeShippingUpdate(id: $id, freeShippingAutomaticDiscount: $input) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticFreeShipping { title status startsAt endsAt }
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticFreeShippingUpdate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id, input });
      throwOnUserErrors(data.discountAutomaticFreeShippingUpdate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticFreeShippingUpdate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Activate automatic discount ────────────────────────────────────────────
  server.tool(
    "activate_automatic_discount",
    "Activate an automatic discount that is currently inactive or scheduled.",
    {
      id: z.string().describe("GID of the automatic discount node (e.g. 'gid://shopify/DiscountAutomaticNode/123')."),
    },
    async ({ id }) => {
      const gql = `
        mutation ActivateAutomaticDiscount($id: ID!) {
          discountAutomaticActivate(id: $id) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ${AUTO_DISCOUNT_INLINE}
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticActivate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountAutomaticActivate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticActivate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Deactivate automatic discount ──────────────────────────────────────────
  server.tool(
    "deactivate_automatic_discount",
    "Deactivate (pause) an automatic discount without deleting it.",
    {
      id: z.string().describe("GID of the automatic discount node."),
    },
    async ({ id }) => {
      const gql = `
        mutation DeactivateAutomaticDiscount($id: ID!) {
          discountAutomaticDeactivate(id: $id) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ${AUTO_DISCOUNT_INLINE}
              }
            }
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticDeactivate: { automaticDiscountNode: unknown; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountAutomaticDeactivate.userErrors);
      return { content: [{ type: "text", text: JSON.stringify(data.discountAutomaticDeactivate.automaticDiscountNode, null, 2) }] };
    }
  );

  // ── Delete automatic discount ──────────────────────────────────────────────
  server.tool(
    "delete_automatic_discount",
    "Permanently delete an automatic discount by its GID. This cannot be undone.",
    {
      id: z.string().describe("GID of the automatic discount node to delete."),
    },
    async ({ id }) => {
      const gql = `
        mutation DeleteAutomaticDiscount($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors { field code message }
          }
        }
      `;
      const data = await client.graphql<{ discountAutomaticDelete: { deletedAutomaticDiscountId: string | null; userErrors: { field?: string[] | null; code?: string | null; message: string }[] } }>(gql, { id });
      throwOnUserErrors(data.discountAutomaticDelete.userErrors);
      return { content: [{ type: "text", text: `Automatic discount ${data.discountAutomaticDelete.deletedAutomaticDiscountId} deleted successfully.` }] };
    }
  );
}
