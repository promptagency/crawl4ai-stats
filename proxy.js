// ---------------------------------------------------------------------------
// Shared proxy logic for server.js (Node) and worker.js (Cloudflare Workers)
// ---------------------------------------------------------------------------

export const MAX_PROXY_BODY_BYTES = 1 * 1024 * 1024;

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|metadata\.)/i;

export function isBlockedHost(hostname) {
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

// Takes the raw JSON request body, returns { status, json } for the client.
export async function proxyPayload(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "Invalid JSON" } };
  }

  const { baseUrl, path, method, token, body: reqBody } = payload ?? {};

  if (!baseUrl || !path) {
    return { status: 400, json: { error: "Missing baseUrl or path" } };
  }

  let target;
  try {
    target = new URL(baseUrl.replace(/\/+$/, "") + path);
  } catch {
    return { status: 400, json: { error: "Invalid URL" } };
  }

  if (isBlockedHost(target.hostname)) {
    return { status: 400, json: { error: "Blocked target host" } };
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
    return { status: 200, json: { ok: upstream.ok, status: upstream.status, body: text } };
  } catch (e) {
    return {
      status: 200,
      json: {
        ok: false,
        status: 502,
        body: JSON.stringify({ error: e.message || "Upstream request failed" }),
      },
    };
  }
}
