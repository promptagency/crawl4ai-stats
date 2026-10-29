// ---------------------------------------------------------------------------
// Cloudflare Worker for Crawl4AI Stats
//
// Handles POST /api/proxy; everything else is served from dist/ via ASSETS.
// ---------------------------------------------------------------------------

import { MAX_PROXY_BODY_BYTES, proxyPayload } from "./proxy.js";

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/proxy") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_PROXY_BODY_BYTES) return json(413, { error: "Payload too large" });

    const { status, json: data } = await proxyPayload(new TextDecoder().decode(buf));
    return json(status, data);
  },
};
