import { useEffect, useState } from "react";
import { Settings as SettingsIcon, PlugZap, Loader2 } from "lucide-react";
import { apiGet, type Settings } from "@/lib/api";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onSave: (s: Settings) => void;
};

export function SettingsPanel({ open, onOpenChange, settings, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setResult(null);
    }
  }, [open, settings]);

  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      await apiGet(draft, "/monitor/health");
      setResult({ ok: true, message: "Connected — /monitor/health responded" });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => onOpenChange(false)}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center gap-2">
          <SettingsIcon className="size-4 text-fg-dim" />
          <h2 className="text-sm font-semibold text-fg-bright">Settings</h2>
        </div>
        <p className="mb-6 text-xs text-fg-dim">
          Connection details are stored locally in this browser.
        </p>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-fg-dim uppercase tracking-wider">Base URL</span>
            <input
              type="url"
              value={draft.baseUrl}
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://crawl4ai.example.com"
              className="rounded border border-border bg-bg px-3 py-2 text-xs text-fg outline-none transition-colors focus:border-fg-dim"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-fg-dim uppercase tracking-wider">API token</span>
            <input
              type="password"
              value={draft.token}
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, token: e.target.value })}
              placeholder="Bearer token"
              className="rounded border border-border bg-bg px-3 py-2 text-xs text-fg outline-none transition-colors focus:border-fg-dim"
            />
            <span className="text-[10px] text-fg-dim">
              Sent as <code className="text-fg">Authorization: Bearer …</code>
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-fg-dim uppercase tracking-wider">Poll interval</span>
              <span className="text-xs text-fg">{draft.pollInterval}s</span>
            </div>
            <input
              type="range"
              min={2}
              max={60}
              step={1}
              value={draft.pollInterval}
              onChange={(e) => setDraft({ ...draft, pollInterval: Number(e.target.value) })}
              className="accent-ok"
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !draft.baseUrl}
              className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs text-fg-dim transition-colors hover:border-fg-dim disabled:opacity-40"
            >
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
              Test connection
            </button>
            {result && (
              <p className={cn("text-[11px]", result.ok ? "text-ok" : "text-err")}>{result.message}</p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                onOpenChange(false);
              }}
              className="flex-1 rounded bg-ok/20 px-3 py-2 text-xs font-medium text-ok transition-colors hover:bg-ok/30"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded border border-border px-3 py-2 text-xs text-fg-dim transition-colors hover:bg-bg-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
