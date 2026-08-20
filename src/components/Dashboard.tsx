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

function Section({ title, count, action, children, id }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-bright">{title}</h2>
          {count !== undefined && <span className="text-xs text-fg-dim">[{count}]</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="panel px-4 py-8 text-center text-xs text-fg-dim">{children}</div>;
}

function Metric({ label, value, sub, bar, tone, children }: { label: string; value: string | React.ReactNode; sub?: string | React.ReactNode; bar?: number; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="panel px-3 py-3">
      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-fg-dim">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone ?? "text-fg-bright")}>{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-hover">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%`, background: "currentColor" }}
          />
        </div>
      )}
      {sub && <div className="mt-0.5 text-[0.68rem] text-fg-dim">{sub}</div>}
      {children}
    </div>
  );
}

function rateTone(pct: number) { return pct >= 95 ? "text-ok" : pct >= 75 ? "text-warn" : "text-err"; }

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

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setReady(true);
    if (!loaded.baseUrl || !loaded.token) setSettingsOpen(true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  useEffect(() => {
    if (!ready || paused || !settings.baseUrl) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const id = setInterval(() => void refresh(controller.signal), settings.pollInterval * 1000);
    return () => { controller.abort(); clearInterval(id); };
  }, [ready, paused, refresh, settings.pollInterval, settings.baseUrl]);

  const active = data.requests?.active ?? [];
  const completed = useMemo(() => [...(data.requests?.completed ?? [])].sort((a, b) => b.end_time - a.end_time), [data.requests]);

  useEffect(() => {
    if (active.length > prevActiveCount.current && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    prevActiveCount.current = active.length;
  }, [active.length]);

  async function runAction(label: string, path: string, body?: unknown) {
    try {
      const res = await apiPost<Record<string, unknown>>(settings, path, body);
      const detail = Object.entries(res).filter(([k]) => k !== "success").map(([k, v]) => `${k}: ${v}`).join(" · ");
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-xl">🕷️</span>
          <h1 className="text-sm font-bold tracking-wide text-fg-bright">Crawl4AI Stats</h1>
          {health && (
            <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider", pressureCls(health.janitor.memory_pressure))}>
              {health.janitor.memory_pressure}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[0.68rem] text-fg-dim">
              <span className={cn("inline-block size-2 rounded-full", connected ? "pulse-dot bg-ok text-ok" : error ? "bg-err" : "bg-fg-dim")} />
              {connected ? "Live" : error ? "disconnected" : "connecting…"}
            </span>
            <span className="hidden text-[0.68rem] tabular-nums text-fg-dim sm:inline">
              {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString([], { hour12: false })}` : "—"}
            </span>
            <button onClick={() => setPaused((p) => !p)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs text-fg-dim transition-colors hover:border-fg-dim hover:text-fg">
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="rounded-md p-1.5 text-fg-dim transition-colors hover:text-fg" aria-label="Settings">
              <SettingsIcon className="size-4" />
            </button>
          </div>
        </div>
        {error && (
          <div className="border-t border-err/30 bg-err/10 px-4 py-2 text-center text-xs text-err">{error}</div>
        )}
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        {/* ---- Top metrics ---- */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="CPU" value={container ? `${container.cpu_percent.toFixed(1)}%` : "—"} bar={container?.cpu_percent} tone={cpuTone} />
          <Metric label="Memory" value={container ? `${container.memory_percent.toFixed(1)}%` : "—"} bar={container?.memory_percent} tone={memTone} />
          <Metric label="Uptime" value={container ? formatDuration(container.uptime_seconds) : "—"} />
          <Metric label="Network" value={container ? <span className="text-base"><span className="text-cold">↑</span>{container.network_sent_mb.toFixed(0)} <span className="text-ok">↓</span>{container.network_recv_mb.toFixed(0)}</span> : "—"} sub="MB total" />
          <Metric label="Browsers" value={data.browsers ? String(data.browsers.summary.total_count) : "—"} sub={data.browsers ? `${data.browsers.summary.total_memory_mb} MB · reuse ${data.browsers.summary.reuse_rate_percent}%` : undefined} />
          <Metric label="Active" value={data.requests ? String(active.length) : "—"} tone={active.length > 0 ? "text-ok" : undefined} sub={data.requests ? `${completed.length} completed` : undefined} />
        </div>

        {/* ---- Browser pool ---- */}
        <Section title="Browser Pool" count={data.browsers?.browsers.length}
          action={
            <ConfirmButton title="Force cleanup?" description="Kills all cold pool browsers." confirmLabel="Cleanup" onConfirm={() => void runAction("Cleanup", "/monitor/actions/cleanup")}>
              <Trash2 className="size-3" /> Cleanup cold
            </ConfirmButton>
          }
        >
          {!data.browsers ? <Empty>No data yet</Empty>
          : data.browsers.browsers.length === 0 ? <Empty>Browser pool is empty</Empty>
          : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.browsers.browsers.map((b) => {
                const meta = TYPE_META[b.type] ?? { icon: "🌐", cls: "text-fg-dim" };
                return (
                  <div key={b.sig} className="panel p-3 transition-colors hover:border-fg-dim/30">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-semibold uppercase tracking-wider", meta.cls)}>{meta.icon} {b.type}</span>
                      <span className="text-[0.65rem] text-fg-dim">{b.sig}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-[0.72rem]">
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
        </Section>

        {/* ---- Endpoint stats ---- */}
        <Section title="Endpoint Stats" count={endpointRows.length}
          action={
            <ConfirmButton title="Reset statistics?" description="All counters are cleared." confirmLabel="Reset" destructive onConfirm={() => void runAction("Stats reset", "/monitor/stats/reset")}>
              <RotateCcw className="size-3" /> Reset stats
            </ConfirmButton>
          }
        >
          {endpointRows.length === 0 ? <Empty>No endpoint statistics yet</Empty> : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["endpoint", "count", "avg latency", "success", "pool hit", "errors"].map(h => (
                      <th key={h} className="px-3 py-2 text-[0.65rem] font-normal uppercase tracking-[0.14em] text-fg-dim">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {endpointRows.map(([ep, s]) => (
                    <tr key={ep} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium text-fg-bright">{ep}</td>
                      <td className="px-3 py-2 tabular-nums">{s.count}</td>
                      <td className="px-3 py-2 tabular-nums">{s.avg_latency_ms.toFixed(0)} ms</td>
                      <td className={cn("px-3 py-2 tabular-nums", rateTone(s.success_rate_percent))}>{s.success_rate_percent.toFixed(1)}%</td>
                      <td className="px-3 py-2 tabular-nums text-cold">{s.pool_hit_rate_percent.toFixed(1)}%</td>
                      <td className={cn("px-3 py-2 tabular-nums", s.errors > 0 ? "text-err" : "text-fg-dim")}>{s.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ---- Active requests ---- */}
        {active.length > 0 && (
          <div ref={activeRef}>
            <Section title="Active Requests" count={active.length}>
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((r) => (
                  <div key={r.id} className="panel flex items-center gap-3 border-ok/30 bg-ok/5 px-3 py-3">
                    <span className="pulse-dot mt-0.5 inline-block size-2 shrink-0 rounded-full bg-ok text-ok" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ok">{r.endpoint}</span>
                        <span className="tabular-nums text-xs text-fg-dim">{Math.max(0, Math.floor(now / 1000 - r.start_time))}s</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-fg-dim" title={r.url}>{truncateUrl(r.url, 80)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ---- Completed requests ---- */}
        <Section title="Completed Requests" count={completed.length}>
          {completed.length === 0 ? <Empty>No completed requests yet</Empty> : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["status", "endpoint", "url", "elapsed", "mem Δ", "pool", "time"].map(h => (
                      <th key={h} className="px-3 py-2 text-[0.65rem] font-normal uppercase tracking-[0.14em] text-fg-dim">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completed.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className={cn("px-3 py-2 tabular-nums", r.success ? "text-ok" : "text-err")}>{r.success ? "✓" : "✗"} {r.status_code}</td>
                      <td className="px-3 py-2">{r.endpoint}</td>
                      <td className="max-w-[22rem] truncate px-3 py-2 text-fg-dim" title={r.url}>{truncateUrl(r.url)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.elapsed.toFixed(2)}s</td>
                      <td className={cn("px-3 py-2 tabular-nums", r.mem_delta > 0 ? "text-warn" : "text-fg-dim")}>{r.mem_delta > 0 ? "+" : ""}{r.mem_delta.toFixed(1)} MB</td>
                      <td className="px-3 py-2">{r.pool_hit ? "♻️" : "🆕"}</td>
                      <td className="px-3 py-2 tabular-nums text-fg-dim">{new Date(r.end_time * 1000).toLocaleTimeString([], { hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ---- Error log ---- */}
        {data.errors.length > 0 && (
          <Section title="Error Log" count={data.errors.length}>
            <div className="space-y-2">
              {data.errors.map((e) => (
                <div key={`${e.request_id}-${e.timestamp}`} className="panel border-l-2 border-l-err px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 text-[0.68rem] text-fg-dim">
                    <span className="tabular-nums">{new Date(e.timestamp * 1000).toLocaleTimeString([], { hour12: false })}</span>
                    <span className="text-err">{e.endpoint}</span>
                    <span className="truncate">{truncateUrl(e.url, 70)}</span>
                    <span className="ml-auto">{e.request_id}</span>
                  </div>
                  <p className="mt-1 text-xs text-err/90">{e.error}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSave={(s) => { setSettings(s); saveSettings(s); toast.success("Settings saved"); }} />
    </div>
  );
}
