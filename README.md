# Kockatoos Shopify MCP Server

[![CI](https://github.com/untitled-developers/shopify-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/untitled-developers/shopify-mcp/actions/workflows/ci.yml)

**[Website](https://untitled-developers.github.io/shopify-mcp)** | **[npm](https://www.npmjs.com/package/@kockatoos/shopify-mcp)** | **[GitHub](https://github.com/untitled-developers/shopify-mcp)**

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI agents full access to the Shopify Admin API. Manage products, orders, customers, collections, fulfillments, discounts, and more through **79 tools** — using both REST and GraphQL under the hood.

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

### Using npx (recommended)

Add this to your MCP client configuration (e.g. `claude_desktop_config.json`, `.vscode/mcp.json`, or equivalent):

```json
{
  "mcpServers": {
    "kockatoos-shopify-mcp": {
      "command": "npx",
      "args": ["-y", "@kockatoos/shopify-mcp"],
      "env": {
        "SHOPIFY_STORE_NAME": "your-store-name",
        "SHOPIFY_CLIENT_ID": "your-client-id",
        "SHOPIFY_CLIENT_SECRET": "your-client-secret"
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
        "SHOPIFY_CLIENT_ID": "your-client-id",
        "SHOPIFY_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_NAME` | Yes | Your store name (just the name, not the full `.myshopify.com` domain) |
| `SHOPIFY_CLIENT_ID` | Yes | App client ID |
| `SHOPIFY_CLIENT_SECRET` | Yes | App client secret |
| `SHOPIFY_API_VERSION` | No | API version (defaults to `2026-01`) |

> **Where to find these:** Shopify Admin → Settings → Apps and sales channels → Develop apps → Your app → API credentials.

---

## Available Tools (79)

### Shop (1)

| Tool | Description |
|------|-------------|
| `get_shop_info` | Get store name, domain, email, plan, currency, timezone |

### Products (10)

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

### Discounts (8)

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
    ├── discounts.ts      # Price rules & discount codes
    ├── fulfillments.ts   # Fulfillments & tracking
    └── webhooks.ts       # Webhook management
```

## License

MIT
