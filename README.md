# 🕷️ Crawl4AI Stats

Real-time monitoring dashboard for self-hosted [Crawl4AI](https://github.com/unclecode/crawl4ai) servers (v0.9.x).

![License](https://img.shields.io/badge/license-MIT-blue)

![Crawl4AI Stats Dashboard](screenshot.jpg)

## What it does

Crawl4AI Stats polls your server's `/monitor/*` API endpoints and displays:

- **System health** — CPU, memory, uptime, network usage, memory pressure
- **Browser pool** — permanent, hot, and cold browsers with age, hits, memory, and kill/restart controls
- **Endpoint statistics** — request count, average latency, success rate, pool hit rate per endpoint
- **Active requests** — live view with elapsed time counter
- **Completed requests** — status, URL, elapsed time, memory delta, pool hit indicator
- **Error log** — recent errors with timestamp, endpoint, and error message
- **Actions** — force cleanup cold browsers, kill/restart individual browsers, reset endpoint statistics

All connection details (server URL and API token) are stored in your browser's localStorage. Nothing is sent to any third party.

## Requirements

- A self-hosted Crawl4AI server running **v0.9.x** with the monitor API enabled (enabled by default)
- CORS configured on the server to allow requests from wherever you host this dashboard
- Node.js 18+ for local development

## Quick start

```bash
git clone https://github.com/promptagency/crawl4ai-stats.git
cd crawl4ai-stats
npm install
npm run dev
```

Open `http://localhost:5173`, click the settings icon, enter your Crawl4AI server URL and API token, and hit **Test connection**.

## Deploying

Build the static files:

```bash
npm run build
```

The `dist/` folder contains a standard static SPA. Deploy it anywhere that serves static files: Cloudflare Pages, Netlify, Vercel, Nginx, Apache, or just `npx serve dist`.

### Docker (optional)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

## CORS configuration

Your Crawl4AI server must allow requests from the domain where you host this dashboard. In your `config.yml`:

```yaml
security:
  cors_allow_origins: ["https://your-dashboard-domain.example"]
```

For local development, add `http://localhost:5173` to the list, or temporarily use `["*"]`.

## API endpoints used

All endpoints require `Authorization: Bearer <CRAWL4AI_API_TOKEN>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitor/health` | System health, pool summary, memory pressure |
| GET | `/monitor/browsers` | Browser pool details |
| GET | `/monitor/requests?status=all&limit=20` | Active and completed requests |
| GET | `/monitor/endpoints/stats` | Per-endpoint performance statistics |
| GET | `/monitor/logs/errors?limit=10` | Recent error log |
| POST | `/monitor/actions/cleanup` | Force cleanup cold pool browsers |
| POST | `/monitor/actions/kill_browser` | Kill a specific browser `{ "sig": "..." }` |
| POST | `/monitor/actions/restart_browser` | Restart a browser `{ "sig": "..." }` |
| POST | `/monitor/stats/reset` | Reset endpoint statistics |

**Note:** The monitor API only tracks requests made via the `/crawl` endpoint. Requests to `/md`, `/html`, `/screenshot`, and `/pdf` are not recorded in the request list or endpoint statistics. This is a limitation in Crawl4AI's monitor system, not in this dashboard.

## Security considerations

- The API token is stored in localStorage and sent directly from the browser to your Crawl4AI server. Only host this dashboard on domains you trust.
- The dashboard validates that the base URL uses `http://` or `https://` before making requests.
- All destructive actions (kill, restart, cleanup, reset) require confirmation via a dialog.
- No data is sent to any third-party service. The dashboard is a pure client-side SPA with zero external dependencies beyond npm packages.
- If you expose your Crawl4AI server to the internet, always use HTTPS and a strong API token.

## Tech stack

- React 19 + TypeScript
- Tailwind CSS 4
- Vite 8
- Lucide icons
- Sonner (toast notifications)

No UI framework, no routing library, no state management library. Minimal dependencies by design.

## License

MIT — see [LICENSE](LICENSE).

## Credits

Built by [Prompt Agency](https://promptagency.se) as a companion tool for self-hosted Crawl4AI deployments.
