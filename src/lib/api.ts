// ---------------------------------------------------------------------------
// Crawl4AI monitor API client
// ---------------------------------------------------------------------------

export type Settings = {
  baseUrl: string;
  token: string;
  pollInterval: number;
};

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "",
  token: "",
  pollInterval: 5,
};

const STORAGE_KEY = "crawl4ai-stats.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      token: typeof parsed.token === "string" ? parsed.token : DEFAULT_SETTINGS.token,
      pollInterval:
        typeof parsed.pollInterval === "number" && parsed.pollInterval >= 2 && parsed.pollInterval <= 60
          ? parsed.pollInterval
          : DEFAULT_SETTINGS.pollInterval,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseUrl: s.baseUrl,
      token: s.token,
      pollInterval: s.pollInterval,
    }),
  );
}

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export type Health = {
  container: {
    memory_percent: number;
    cpu_percent: number;
    network_sent_mb: number;
    network_recv_mb: number;
    uptime_seconds: number;
  };
  pool: {
    permanent: { active: boolean; memory_mb: number };
    hot: { count: number; memory_mb: number };
    cold: { count: number; memory_mb: number };
    total_memory_mb: number;
  };
  janitor: { next_cleanup_estimate: string; memory_pressure: string };
};

export type BrowserInfo = {
  type: "permanent" | "hot" | "cold";
  sig: string;
  age_seconds: number;
  last_used_seconds: number;
  memory_mb: number;
  hits: number;
  killable: boolean;
};

export type BrowsersResponse = {
  browsers: BrowserInfo[];
  summary: { total_count: number; total_memory_mb: number; reuse_rate_percent: number };
};

export type ActiveRequest = {
  id: string;
  endpoint: string;
  url: string;
  start_time: number;
  config_sig: string;
  mem_start: number;
};

export type CompletedRequest = {
  id: string;
  endpoint: string;
  url: string;
  start_time: number;
  end_time: number;
  elapsed: number;
  mem_delta: number;
  success: boolean;
  error: string | null;
  status_code: number;
  pool_hit: boolean;
};

export type RequestsResponse = {
  active: ActiveRequest[];
  completed: CompletedRequest[];
};

export type EndpointStat = {
  count: number;
  avg_latency_ms: number;
  success_rate_percent: number;
  pool_hit_rate_percent: number;
  errors: number;
};

export type EndpointStats = Record<string, EndpointStat>;

export type ErrorEntry = {
  timestamp: number;
  endpoint: string;
  url: string;
  error: string;
  request_id: string;
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function validateUrl(base: string): URL {
  const url = new URL(base);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http/https URLs are allowed");
  }
  return url;
}

async function call<T>(
  settings: Settings,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const base = validateUrl(settings.baseUrl.replace(/\/+$/, ""));
  const url = `${base.origin}${path}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (settings.token) headers["Authorization"] = `Bearer ${settings.token}`;
  if (method === "POST") headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : null,
    signal,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && parsed !== null && "detail" in parsed
        ? String((parsed as Record<string, unknown>).detail)
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return parsed as T;
}

export async function apiGet<T>(settings: Settings, path: string, signal?: AbortSignal): Promise<T> {
  return call<T>(settings, path, "GET", undefined, signal);
}

export async function apiPost<T>(settings: Settings, path: string, body?: unknown): Promise<T> {
  return call<T>(settings, path, "POST", body);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function truncateUrl(value: string, max = 60): string {
  if (!value) return "—";
  const clean = value.replace(/^https?:\/\//, "");
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}
