import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { ConfirmButton } from "./ConfirmDialog";
import { SettingsPanel } from "./SettingsPanel";
import {
  apiGet,
  apiPost,
  DEFAULT_SETTINGS,
  formatDuration,
  loadSettings,
  saveSettings,
  truncateUrl,
  type BrowsersResponse,
  type EndpointStats,
  type ErrorEntry,
  type Health,
  type RequestsResponse,
  type Settings,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Snapshot = {
  health: Health | null;
  browsers: BrowsersResponse | null;
  requests: RequestsResponse | null;
  endpoints: EndpointStats | null;
  errors: ErrorEntry[];
};

const EMPTY: Snapshot = { health: null, browsers: null, requests: null, endpoints: null, errors: [] };

const TYPE_META: Record<string, { icon: string; cls: string }> = {
  permanent: { icon: "🔥", cls: "text-perm" },
  hot: { icon: "♨️", cls: "text-hot" },
  cold: { icon: "❄️", cls: "text-cold" },
};

// ---------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------

function pressureCls(p: string) {
  const v = p?.toUpperCase();
  if (v === "HIGH") return "text-err border-err/40 bg-err/10";
  if (v === "MEDIUM") return "text-warn border-warn/40 bg-warn/10";
  return "text-ok border-ok/40 bg-ok/10";
}

function Panel({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-lg border border-border bg-bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-[10px] tracking-[0.18em] text-fg-dim uppercase">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-dashed border-border px-4 py-6 text-center text-xs text-fg-dim">{children}</p>
  );
}

function Metric({ label, value, sub, bar, tone }: { label: string; value: string; sub?: string; bar?: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card px-4 py-3 transition-colors duration-500">
      <div className="text-[10px] tracking-[0.18em] text-fg-dim uppercase">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold leading-tight tabular-nums", tone ?? "text-fg-bright")}>{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%`, background: "currentColor" }}
          />
        </div>
      )}
      {sub && <div className="mt-1 text-[10px] text-fg-dim">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef<HTMLDivElement | null>(null);
  const prevActiveCount = useRef(0);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setReady(true);
    if (!loaded.baseUrl || !loaded.token) setSettingsOpen(true);
  }, []);

  // Tick for live elapsed counters
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch all monitor data
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!settings.baseUrl) return;
      try {
        const [health, browsers, requests, endpoints, errResp] = await Promise.all([
          apiGet<Health>(settings, "/monitor/health", signal),
          apiGet<BrowsersResponse>(settings, "/monitor/browsers", signal),
          apiGet<RequestsResponse>(settings, "/monitor/requests?status=all&limit=20", signal),
          apiGet<EndpointStats>(settings, "/monitor/endpoints/stats", signal),
          apiGet<{ errors: ErrorEntry[] }>(settings, "/monitor/logs/errors?limit=10", signal),
        ]);
        setData({ health, browsers, requests, endpoints, errors: errResp?.errors ?? [] });
        setError(null);
        setLastUpdated(new Date());
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Request failed");
      }
    },
    [settings],
  );

  // Poll loop
  useEffect(() => {
    if (!ready || paused || !settings.baseUrl) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const id = setInterval(() => void refresh(controller.signal), settings.pollInterval * 1000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [ready, paused, refresh, settings.pollInterval, settings.baseUrl]);

  const active = data.requests?.active ?? [];
  const completed = useMemo(
    () => [...(data.requests?.completed ?? [])].sort((a, b) => b.end_time - a.end_time),
    [data.requests],
  );

  // Auto-scroll to active requests
  useEffect(() => {
    if (active.length > prevActiveCount.current && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    prevActiveCount.current = active.length;
  }, [active.length]);

  // Run a server action
  async function runAction(label: string, path: string, body?: unknown) {
    try {
      const res = await apiPost<Record<string, unknown>>(settings, path, body);
      const detail = Object.entries(res)
        .filter(([k]) => k !== "success")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      toast.success(label, { description: detail || "Done" });
      void refresh();
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : "Request failed" });
    }
  }

  const health = data.health;
  const container = health?.container;
  const connected = !error && lastUpdated !== null;
  const memTone = (container?.memory_percent ?? 0) > 85 ? "text-err" : (container?.memory_percent ?? 0) > 60 ? "text-warn" : "text-ok";
  const cpuTone = (container?.cpu_percent ?? 0) > 85 ? "text-err" : (container?.cpu_percent ?? 0) > 50 ? "text-warn" : "text-ok";
  const endpointRows = Object.entries(data.endpoints ?? {});

  return (
    <div className="min-h-screen pb-16">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-xl">🕷️</span>
          <h1 className="text-base font-semibold text-fg-bright tracking-tight">Crawl4AI Stats</h1>
          {health && (
            <span className={cn("rounded border px-2 py-0.5 text-[10px] tracking-wider uppercase", pressureCls(health.janitor.memory_pressure))}>
              mem {health.janitor.memory_pressure}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 text-[11px] text-fg-dim">
              <span className={cn("inline-block size-2 rounded-full", connected ? "pulse-dot bg-ok text-ok" : "bg-err text-err")} />
              {connected ? `updated ${lastUpdated?.toLocaleTimeString()}` : error ? "disconnected" : "connecting…"}
            </span>
            <button onClick={() => setPaused((p) => !p)} className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-fg-dim transition-colors hover:border-fg-dim">
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="rounded p-1.5 text-fg-dim transition-colors hover:text-fg" aria-label="Settings">
              <SettingsIcon className="size-4" />
            </button>
          </div>
        </div>
        {error && (
          <div className="border-t border-err/30 bg-err/10 px-4 py-2 text-center text-xs text-err">
            {error}
          </div>
        )}
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6">
        {/* ---- Top metrics ---- */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="CPU" value={container ? `${container.cpu_percent.toFixed(1)}%` : "—"} bar={container?.cpu_percent} tone={cpuTone} />
          <Metric label="Memory" value={container ? `${container.memory_percent.toFixed(1)}%` : "—"} bar={container?.memory_percent} tone={memTone} />
          <Metric label="Uptime" value={container ? formatDuration(container.uptime_seconds) : "—"} />
          <Metric label="Network" value={container ? `↑${container.network_sent_mb.toFixed(0)} ↓${container.network_recv_mb.toFixed(0)}` : "—"} sub="MB total" />
          <Metric label="Browsers" value={data.browsers ? String(data.browsers.summary.total_count) : "—"} sub={data.browsers ? `${data.browsers.summary.total_memory_mb} MB · reuse ${data.browsers.summary.reuse_rate_percent}%` : undefined} />
          <Metric label="Active" value={data.requests ? String(active.length) : "—"} tone={active.length > 0 ? "text-ok" : undefined} sub={data.requests ? `${completed.length} completed` : undefined} />
        </div>

        {/* ---- Browser pool ---- */}
        <Panel
          title="Browser pool"
          action={
            <ConfirmButton title="Force cleanup?" description="Kills all cold pool browsers." confirmLabel="Cleanup" onConfirm={() => void runAction("Cleanup", "/monitor/actions/cleanup")}>
              <Trash2 className="size-3" /> Cleanup cold
            </ConfirmButton>
          }
        >
          {!data.browsers ? (
            <Empty>No data yet</Empty>
          ) : data.browsers.browsers.length === 0 ? (
            <Empty>Browser pool is empty</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.browsers.browsers.map((b) => {
                const meta = TYPE_META[b.type] ?? { icon: "🌐", cls: "text-fg-dim" };
                return (
                  <div key={b.sig} className="rounded border border-border bg-bg p-3 transition-colors hover:border-fg-dim/30">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs uppercase tracking-wider", meta.cls)}>{meta.icon} {b.type}</span>
                      <span className="text-[10px] text-fg-dim">{b.sig}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[11px]">
                      <dt className="text-fg-dim">age</dt><dd className="text-right tabular-nums">{formatDuration(b.age_seconds)}</dd>
                      <dt className="text-fg-dim">last used</dt><dd className="text-right tabular-nums">{formatDuration(b.last_used_seconds)}</dd>
                      <dt className="text-fg-dim">hits</dt><dd className="text-right tabular-nums">{b.hits}</dd>
                      <dt className="text-fg-dim">memory</dt><dd className="text-right tabular-nums">{b.memory_mb} MB</dd>
                    </dl>
                    <div className="mt-3 flex gap-2">
                      {b.killable && (
                        <ConfirmButton title={`Kill ${b.sig}?`} description="Terminates immediately." confirmLabel="Kill" destructive onConfirm={() => void runAction("Kill browser", "/monitor/actions/kill_browser", { sig: b.sig })}>
                          Kill
                        </ConfirmButton>
                      )}
                      <ConfirmButton title={`Restart ${b.sig}?`} description="In-flight work may fail." confirmLabel="Restart" onConfirm={() => void runAction("Restart", "/monitor/actions/restart_browser", { sig: b.type === "permanent" ? "permanent" : b.sig })}>
                        <RotateCcw className="size-3" /> Restart
                      </ConfirmButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ---- Endpoint stats ---- */}
        <Panel
          title="Endpoint stats"
          action={
            <ConfirmButton title="Reset statistics?" description="All counters are cleared." confirmLabel="Reset" destructive onConfirm={() => void runAction("Stats reset", "/monitor/stats/reset")}>
              <RotateCcw className="size-3" /> Reset
            </ConfirmButton>
          }
        >
          {endpointRows.length === 0 ? (
            <Empty>No endpoint statistics yet</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] tracking-[0.15em] text-fg-dim uppercase">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-normal">endpoint</th>
                    <th className="py-2 pr-3 text-right font-normal">count</th>
                    <th className="py-2 pr-3 text-right font-normal">avg latency</th>
                    <th className="py-2 pr-3 text-right font-normal">success</th>
                    <th className="py-2 pr-3 text-right font-normal">pool hit</th>
                    <th className="py-2 text-right font-normal">errors</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointRows.map(([ep, s]) => (
                    <tr key={ep} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-fg-bright">{ep}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.count}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{(s.avg_latency_ms / 1000).toFixed(2)}s</td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", s.success_rate_percent >= 99 ? "text-ok" : s.success_rate_percent >= 90 ? "text-warn" : "text-err")}>{s.success_rate_percent.toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.pool_hit_rate_percent.toFixed(0)}%</td>
                      <td className={cn("py-2 text-right tabular-nums", s.errors > 0 ? "text-err" : "text-fg-dim")}>{s.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---- Active requests ---- */}
        {active.length > 0 && (
          <div ref={activeRef}>
            <Panel title={`Active requests (${active.length})`}>
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((r) => (
                  <div key={r.id} className="rounded border border-ok/30 bg-ok/5 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="pulse-dot inline-block size-2 rounded-full bg-ok text-ok" />
                      <span className="text-ok">{r.endpoint}</span>
                      <span className="ml-auto tabular-nums text-fg-dim">{Math.max(0, Math.floor(now / 1000 - r.start_time))}s</span>
                    </div>
                    <p className="mt-2 break-all text-[11px] text-fg-dim">{truncateUrl(r.url, 90)}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* ---- Completed requests ---- */}
        <Panel title="Completed requests">
          {completed.length === 0 ? (
            <Empty>No completed requests yet</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] tracking-[0.15em] text-fg-dim uppercase">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-normal">status</th>
                    <th className="py-2 pr-3 font-normal">endpoint</th>
                    <th className="py-2 pr-3 font-normal">url</th>
                    <th className="py-2 pr-3 text-right font-normal">elapsed</th>
                    <th className="py-2 pr-3 text-right font-normal">mem Δ</th>
                    <th className="py-2 text-right font-normal">pool</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className={cn("py-2 pr-3", r.success ? "text-ok" : "text-err")}>{r.success ? "✓" : "✗"} {r.status_code}</td>
                      <td className="py-2 pr-3">{r.endpoint}</td>
                      <td className="py-2 pr-3 text-fg-dim" title={r.url}>{truncateUrl(r.url, 50)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.elapsed.toFixed(2)}s</td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", r.mem_delta > 0 ? "text-warn" : "text-fg-dim")}>{r.mem_delta > 0 ? "+" : ""}{r.mem_delta.toFixed(1)}</td>
                      <td className="py-2 text-right">{r.pool_hit ? "♻️" : "🆕"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---- Error log ---- */}
        {data.errors.length > 0 && (
          <Panel title={`Error log (${data.errors.length})`}>
            <div className="flex flex-col gap-3">
              {data.errors.map((e) => (
                <div key={`${e.request_id}-${e.timestamp}`} className="rounded border border-border border-l-2 border-l-err bg-err/5 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-dim">
                    <span>{new Date(e.timestamp * 1000).toLocaleString()}</span>
                    <span className="text-err">{e.endpoint}</span>
                    <span className="ml-auto">{e.request_id}</span>
                  </div>
                  <p className="mt-1 break-all text-[11px] text-fg-dim">{truncateUrl(e.url, 90)}</p>
                  <p className="mt-2 text-xs text-err">{e.error}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </main>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSave={(s) => { setSettings(s); saveSettings(s); toast.success("Settings saved"); }} />
    </div>
  );
}
