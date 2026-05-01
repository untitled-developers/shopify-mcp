# Kockatoos Shopify MCP Server

[![CI](https://github.com/untitled-developers/shopify-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/untitled-developers/shopify-mcp/actions/workflows/ci.yml)

**[Website](https://untitled-developers.github.io/shopify-mcp)** | **[npm](https://www.npmjs.com/package/@kockatoos/shopify-mcp)** | **[GitHub](https://github.com/untitled-developers/shopify-mcp)**

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI agents full access to the Shopify Admin API. Manage products, orders, customers, collections, fulfillments, discounts, and more through **128 tools** — using both REST and GraphQL under the hood.

---

## Installation

```bash
npm install @kockatoos/shopify-mcp
```

Or run directly with npx (no install needed):

```bash
npx @kockatoos/shopify-mcp
```

---

## Quick Start

### Step 1 — Create a Shopify app

You need a Shopify app with an access token to authenticate. There are two types:

#### Option A: Admin-created custom app (simplest)

1. Go to **Shopify Admin → Settings → Apps and sales channels → Develop apps**
2. Create an app, configure the required Admin API scopes, and click **Install app**
3. Copy the **Admin API access token** shown once after installation

Use it directly in your MCP config:

```json
{
  "mcpServers": {
    "kockatoos-shopify-mcp": {
      "command": "npx",
      "args": ["-y", "@kockatoos/shopify-mcp"],
      "env": {
        "SHOPIFY_STORE_NAME": "your-store-name",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

#### Option B: Partner Dashboard app

Partner Dashboard apps use OAuth and don't expose an access token in the UI. Run the one-time token helper to get a permanent offline access token:

```bash
# With npm install
SHOPIFY_CLIENT_ID=xxx SHOPIFY_CLIENT_SECRET=yyy SHOPIFY_STORE_NAME=zzz \
  npx shopify-mcp-get-token

# Or if you cloned the repo
SHOPIFY_CLIENT_ID=xxx SHOPIFY_CLIENT_SECRET=yyy SHOPIFY_STORE_NAME=zzz \
  npm run get-token
```

> **Before running:** add `http://localhost:3456/callback` to your app's **Allowed Redirect URLs** in the Partner Dashboard (App setup → URLs).

This opens a browser, completes the OAuth flow, and prints your access token. Then use it in your MCP config the same way as Option A.

---

### Step 2 — Configure your MCP client

Add this to your MCP client configuration (e.g. `claude_desktop_config.json`, `.vscode/mcp.json`, or equivalent):

```json
{
  "mcpServers": {
    "kockatoos-shopify-mcp": {
      "command": "npx",
      "args": ["-y", "@kockatoos/shopify-mcp"],
      "env": {
        "SHOPIFY_STORE_NAME": "your-store-name",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Using a local clone

```bash
git clone https://github.com/untitled-developers/shopify-mcp.git
cd shopify-mcp
npm install
npm run build
```

Then point your MCP client to the built output:

```json
{
  "mcpServers": {
    "kockatoos-shopify-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/shopify-mcp/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_NAME": "your-store-name",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_NAME` | Yes | Your store subdomain (e.g. `my-store`, not the full `.myshopify.com`) |
| `SHOPIFY_ACCESS_TOKEN` | Yes* | Permanent access token (from admin-created app or Partner Dashboard OAuth flow) |
| `SHOPIFY_API_VERSION` | No | API version (defaults to `2026-01`) |

> \* `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` can be used instead of `SHOPIFY_ACCESS_TOKEN` only for admin-created custom apps (store-only, no Partner Dashboard support).

---

## Available Tools (80)

### Shop (1)

| Tool | Description |
|------|-------------|
| `get_shop_info` | Get store name, domain, email, plan, currency, timezone |

### Products (11)

| Tool | Description |
|------|-------------|
| `list_products` | List products with filters (status, vendor, type) and pagination |
| `get_product` | Get full product details including variants and images |
| `create_product` | Create a product with title, description, variants, images |
| `update_product` | Update product fields (title, description, status, tags, etc.) |
| `delete_product` | Permanently delete a product by ID |
| `list_product_metafields` | List all metafields for a product (GraphQL) |
| `get_product_metafield` | Get a product metafield by namespace and key (GraphQL) |
| `set_product_metafield` | Create or update a product metafield via `metafieldsSet` (GraphQL) |
| `delete_product_metafield` | Delete a product metafield (GraphQL) |
| `list_metafield_definitions` | List all product metafield definitions with validations (GraphQL) |
| `create_metafield_definition` | Create a new metafield definition for products (or other resource types) with validation rules (GraphQL) |

### Product Images (5)

| Tool | Description |
|------|-------------|
| `list_product_images` | List all images for a product |
| `get_product_image` | Get a specific product image |
| `create_product_image` | Add an image to a product (by URL or base64) |
| `update_product_image` | Update image alt text or position |
| `delete_product_image` | Remove an image from a product |

### Variants (5)

| Tool | Description |
|------|-------------|
| `list_variants` | List all variants of a product |
| `get_variant` | Get a specific variant |
| `create_variant` | Add a new variant to a product |
| `update_variant` | Update variant price, SKU, inventory, etc. |
| `delete_variant` | Remove a variant from a product |

### Collections (10)

| Tool | Description |
|------|-------------|
| `list_custom_collections` | List custom (manual) collections |
| `list_smart_collections` | List smart (automated) collections |
| `get_custom_collection` | Get a custom collection by ID |
| `get_smart_collection` | Get a smart collection by ID |
| `create_custom_collection` | Create a manual collection |
| `update_custom_collection` | Update a custom collection |
| `delete_custom_collection` | Delete a custom collection |
| `add_product_to_collection` | Add a product to a custom collection |
| `remove_product_from_collection` | Remove a product from a custom collection |
| `list_collection_products` | List all products in a collection |

### Orders (9)

| Tool | Description |
|------|-------------|
| `list_orders` | List orders with filters (status, financial status, date range) |
| `get_order` | Get full order details (line items, shipping, transactions) |
| `update_order` | Update order notes, tags, or email |
| `close_order` | Mark an order as closed/completed |
| `cancel_order` | Cancel an order with optional reason, email notification, restock |
| `list_order_metafields` | List all metafields for an order (GraphQL) |
| `get_order_metafield` | Get an order metafield by namespace and key (GraphQL) |
| `set_order_metafield` | Create or update an order metafield via `metafieldsSet` (GraphQL) |
| `delete_order_metafield` | Delete an order metafield (GraphQL) |

### Customers (9)

| Tool | Description |
|------|-------------|
| `list_customers` | List customers with pagination |
| `search_customers` | Search by email, name, country, etc. |
| `get_customer` | Get full customer details and addresses |
| `create_customer` | Create a customer with email, name, phone, addresses |
| `update_customer` | Update customer fields |
| `list_customer_metafields` | List all metafields for a customer (GraphQL) |
| `get_customer_metafield` | Get a customer metafield by namespace and key (GraphQL) |
| `set_customer_metafield` | Create or update a customer metafield via `metafieldsSet` (GraphQL) |
| `delete_customer_metafield` | Delete a customer metafield (GraphQL) |

### Inventory (5)

| Tool | Description |
|------|-------------|
| `list_locations` | List all warehouse/store locations |
| `get_location` | Get details of a specific location |
| `list_inventory_levels` | Get stock quantities at a location |
| `adjust_inventory` | Adjust stock by a relative amount (+/-) |
| `set_inventory` | Set stock to an absolute quantity |

### Draft Orders (7)

| Tool | Description |
|------|-------------|
| `list_draft_orders` | List draft orders with pagination |
| `get_draft_order` | Get a draft order by ID |
| `create_draft_order` | Create a new draft order with line items |
| `update_draft_order` | Update a draft order |
| `complete_draft_order` | Convert a draft order into a real order |
| `send_draft_order_invoice` | Email the draft order invoice to the customer |
| `delete_draft_order` | Delete a draft order |

### Discounts — Legacy REST (8)

These tools use the legacy REST Price Rules API and remain for backward compatibility.

| Tool | Description |
|------|-------------|
| `list_price_rules` | List all price rules |
| `get_price_rule` | Get a price rule by ID |
| `create_price_rule` | Create a price rule (percentage, fixed, shipping) |
| `update_price_rule` | Update a price rule |
| `delete_price_rule` | Delete a price rule |
| `list_discount_codes` | List discount codes for a price rule |
| `create_discount_code` | Create a discount code for a price rule |
| `delete_discount_code` | Delete a discount code |

### Discounts — Code Discounts / GraphQL (11)

Modern Shopify GraphQL discount API for code-based discounts (amount off, BXGY, free shipping).

| Tool | Description |
|------|-------------|
| `list_code_discounts` | List code discounts (paginated, optional search query) |
| `get_code_discount` | Get a code discount by GID or by code string |
| `create_code_discount_basic` | Create an amount-off code discount |
| `update_code_discount_basic` | Update an amount-off code discount |
| `create_code_discount_bxgy` | Create a Buy X Get Y code discount |
| `update_code_discount_bxgy` | Update a Buy X Get Y code discount |
| `create_code_discount_free_shipping` | Create a free-shipping code discount |
| `update_code_discount_free_shipping` | Update a free-shipping code discount |
| `activate_code_discount` | Activate a code discount |
| `deactivate_code_discount` | Deactivate a code discount |
| `delete_code_discount` | Delete a code discount by GID |

### Discounts — Automatic Discounts / GraphQL (11)

Modern Shopify GraphQL discount API for automatic discounts (applied without a code).

| Tool | Description |
|------|-------------|
| `list_automatic_discounts` | List automatic discounts (paginated, optional search query) |
| `get_automatic_discount` | Get an automatic discount by GID |
| `create_automatic_discount_basic` | Create an amount-off automatic discount |
| `update_automatic_discount_basic` | Update an amount-off automatic discount |
| `create_automatic_discount_bxgy` | Create a Buy X Get Y automatic discount |
| `update_automatic_discount_bxgy` | Update a Buy X Get Y automatic discount |
| `create_automatic_discount_free_shipping` | Create a free-shipping automatic discount |
| `update_automatic_discount_free_shipping` | Update a free-shipping automatic discount |
| `activate_automatic_discount` | Activate an automatic discount |
| `deactivate_automatic_discount` | Deactivate an automatic discount |
| `delete_automatic_discount` | Delete an automatic discount by GID |

### Fulfillments (5)

| Tool | Description |
|------|-------------|
| `list_fulfillment_orders` | List fulfillment orders for an order |
| `list_fulfillments` | List fulfillments for an order |
| `create_fulfillment` | Create a fulfillment with tracking info |
| `update_fulfillment_tracking` | Update tracking number/URL on a fulfillment |
| `cancel_fulfillment` | Cancel a fulfillment |

### Webhooks (5)

| Tool | Description |
|------|-------------|
| `list_webhooks` | List all registered webhooks |
| `get_webhook` | Get a webhook by ID |
| `create_webhook` | Register a new webhook |
| `update_webhook` | Update a webhook URL or topic |
| `delete_webhook` | Remove a webhook |

---

## Authentication

The server uses Shopify's **client_credentials** OAuth grant — no browser-based authorization needed. It automatically obtains and caches an access token on the first API call.

Required app scopes (configure in Shopify Admin → App → API access):
- `read_products`, `write_products`
- `read_orders`, `write_orders`
- `read_customers`, `write_customers`
- `read_inventory`, `write_inventory`
- `read_locations`
- `read_draft_orders`, `write_draft_orders`
- `read_price_rules`, `write_price_rules`
- `read_discounts`, `write_discounts`
- `read_shipping`, `write_shipping`
- `read_fulfillments`, `write_fulfillments`

---

## Development

```bash
# Run directly with ts-node (reads .env automatically)
npm run dev

# Build to dist/
npm run build

# Run compiled version
npm start
```

## Architecture

```
src/
├── index.ts              # MCP server entry — wires everything together
├── config.ts             # Environment variable loading & validation
├── auth.ts               # Token management (client_credentials grant)
├── shopify-client.ts     # HTTP client (REST + GraphQL)
└── tools/
    ├── shop.ts           # Store info
    ├── products.ts       # Products, product metafields, metafield definitions
    ├── images.ts         # Product images
    ├── variants.ts       # Product variants
    ├── collections.ts    # Custom & smart collections
    ├── orders.ts         # Orders & order metafields
    ├── customers.ts      # Customers & customer metafields
    ├── inventory.ts      # Locations & inventory levels
    ├── draft-orders.ts   # Draft orders
    ├── discounts.ts      # Legacy price rules (REST) + GraphQL code & automatic discounts
    ├── fulfillments.ts   # Fulfillments & tracking
    └── webhooks.ts       # Webhook management
```

## License

MIT
