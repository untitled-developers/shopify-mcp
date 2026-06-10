#!/usr/bin/env node
/**
 * One-time OAuth helper for Partner Dashboard apps.
 *
 * Completes the Shopify authorization code grant flow, then appends
 * SHOPIFY_ACCESS_TOKEN to the .env file in the current working directory.
 *
 * Usage:
 *   npx shopify-mcp-get-token
 *   # or from the package directory:
 *   node dist/get-token.js
 *
 * Required env vars (in .env or shell):
 *   SHOPIFY_CLIENT_ID
 *   SHOPIFY_CLIENT_SECRET
 *   SHOPIFY_STORE_NAME  (just the subdomain, e.g. "my-store")
 *
 * Optional:
 *   SHOPIFY_SCOPES  (comma-separated; defaults to full write access)
 */

import dotenv from "dotenv";
import path from "path";
import http from "http";
import { exec } from "child_process";

// Load .env from CWD first, then package dir fallback
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const STORE_NAME = process.env.SHOPIFY_STORE_NAME;
const SCOPES =
  process.env.SHOPIFY_SCOPES ||
  [
    "read_products", "write_products",
    "read_orders", "write_orders",
    "read_customers", "write_customers",
    "read_draft_orders", "write_draft_orders",
    "read_inventory", "write_inventory",
    "read_fulfillments", "write_fulfillments",
    "read_shipping", "write_shipping",
    "read_discounts", "write_discounts",
    "read_script_tags", "write_script_tags",
    "read_themes", "write_themes",
    "read_content", "write_content",
    "read_online_store_pages", "write_online_store_pages",
    "read_online_store_navigation", "write_online_store_navigation",
    "read_files", "write_files",
    "read_locales",
    "read_metaobjects", "write_metaobjects",
    "read_metaobject_definitions", "write_metaobject_definitions",
  ].join(",");

const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !STORE_NAME) {
  console.error(
    "Error: Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_STORE_NAME in your .env file."
  );
  process.exit(1);
}

const shop = `${STORE_NAME}.myshopify.com`;
const state = Math.random().toString(36).slice(2);
const authorizeUrl =
  `https://${shop}/admin/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}`;

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? `open "${url}"` :
    platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log("Could not open browser automatically. Open this URL manually:\n");
      console.log(url);
    }
  });
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) {
    throw new Error(`No access_token in response: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}


const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h2>OAuth error: ${error}</h2><p>You can close this tab.</p>`);
    server.close();
    console.error(`\nOAuth error: ${error}`);
    process.exit(1);
  }

  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h2>State mismatch — possible CSRF. Try again.</h2>");
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h2>No code in callback.</h2>");
    server.close();
    process.exit(1);
  }

  try {
    console.log("\nExchanging authorization code for access token...");
    const token = await exchangeCodeForToken(code);

    console.log("\n✅ Access token obtained!");
    console.log(`\nSHOPIFY_ACCESS_TOKEN=${token}`);
    console.log("\nAdd the above line to your MCP config's env block or .env file,");
    console.log("then restart your MCP server.\n");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h2>✅ Authorization successful!</h2>" +
      "<p>Your access token has been printed to the terminal.</p>" +
      "<p>Add <code>SHOPIFY_ACCESS_TOKEN=&lt;token&gt;</code> to your MCP config's <code>env</code> block, then restart the MCP server.</p>" +
      "<p>You can close this tab.</p>"
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h2>Token exchange failed</h2><pre>${err}</pre>`);
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log(`\nShopify MCP — Get Access Token`);
  console.log(`================================`);
  console.log(`Store:  ${shop}`);
  console.log(`Scopes: ${SCOPES}\n`);
  console.log(`Opening browser for authorization...`);
  console.log(`(If the browser doesn't open, visit the URL printed below)\n`);
  openBrowser(authorizeUrl);
});
