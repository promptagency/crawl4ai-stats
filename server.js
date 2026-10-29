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
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROXY_BODY_BYTES, proxyPayload } from "./proxy.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DIST = join(fileURLToPath(import.meta.url), "..", "dist");
const IS_PROD = process.argv.includes("--production");
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
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_PROXY_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
      req.destroy();
      return;
    }
    body += chunk;
  }

  const { status, json } = await proxyPayload(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(json));
}

async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    urlPath = "/";
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  let filePath = resolve(DIST, rel);
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
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
