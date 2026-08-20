// ---------------------------------------------------------------------------
// Lightweight proxy server for Crawl4AI Stats
//
// In development:  runs alongside Vite dev server (Vite proxies /api/* here)
// In production:   serves the static dist/ folder AND handles /api/proxy
//
// Usage:
//   npm run dev        → starts both Vite + proxy server
//   npm run server     → production mode (serves dist/ + proxy)
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DIST = join(fileURLToPath(import.meta.url), "..", "dist");
const IS_PROD = process.argv.includes("--production");

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|metadata\.)/i;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function handleProxy(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { baseUrl, path, method, token, body: reqBody } = payload;

  if (!baseUrl || !path) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing baseUrl or path" }));
    return;
  }

  let target;
  try {
    target = new URL(baseUrl.replace(/\/+$/, "") + path);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid URL" }));
    return;
  }

  if (PRIVATE_HOST.test(target.hostname)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Blocked target host" }));
    return;
  }

  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (method === "POST") headers["Content-Type"] = "application/json";

  try {
    const upstream = await fetch(target.toString(), {
      method: method || "GET",
      headers,
      body: method === "POST" ? (reqBody ?? "{}") : null,
      signal: AbortSignal.timeout(20000),
    });
    const text = await upstream.text();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: upstream.ok, status: upstream.status, body: text }));
  } catch (e) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: 502,
      body: JSON.stringify({ error: e.message || "Upstream request failed" }),
    }));
  }
}

async function serveStatic(req, res) {
  let filePath = join(DIST, req.url === "/" ? "index.html" : req.url);
  try {
    await stat(filePath);
  } catch {
    filePath = join(DIST, "index.html");
  }
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/proxy") {
    return handleProxy(req, res);
  }
  if (IS_PROD) {
    return serveStatic(req, res);
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  if (IS_PROD) {
    console.log(`Crawl4AI Stats running at http://localhost:${PORT}`);
  } else {
    console.log(`Proxy server listening on port ${PORT}`);
  }
});
