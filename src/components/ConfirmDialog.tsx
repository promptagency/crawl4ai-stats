import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
  destructive?: boolean;
};

export function ConfirmButton({ title, description, confirmLabel, onConfirm, children, destructive }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-border bg-transparent px-2.5 py-1 text-[11px] text-fg-dim transition-colors hover:border-fg-dim hover:text-fg"
      >
        {children}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-border bg-bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-fg-bright">{title}</h3>
            <p className="mt-2 text-xs text-fg-dim">{description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-border px-3 py-1.5 text-xs text-fg-dim transition-colors hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  destructive
                    ? "bg-err/20 text-err hover:bg-err/30"
                    : "bg-fg-dim/20 text-fg hover:bg-fg-dim/30",
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
