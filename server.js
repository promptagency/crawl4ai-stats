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

const PORT = parseInt(process.env.PORT || "3001", 10);
const DIST = join(fileURLToPath(import.meta.url), "..", "dist");
const IS_PROD = process.argv.includes("--production");
const MAX_PROXY_BODY_BYTES = 1 * 1024 * 1024;

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|metadata\.)/i;

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (PRIVATE_HOST.test(h)) return true;
  if (h.startsWith("[") && h.endsWith("]")) {
    const ip6 = h.slice(1, -1);
    if (ip6 === "::1" || ip6 === "0:0:0:0:0:0:0:1") return true; // loopback
    if (/^fe[89ab][0-9a-f]:/.test(ip6)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(ip6)) return true; // unique local fc00::/7
    const mapped = ip6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped && PRIVATE_HOST.test(mapped[1])) return true; // IPv4-mapped IPv6
  }
  return false;
}

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

  if (isBlockedHost(target.hostname)) {
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
