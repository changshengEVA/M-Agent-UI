import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { SceneEntry } from "../types/chat";

interface SceneTimelinePanelProps {
  entries: SceneEntry[];
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  initialPosition?: { left: number; top: number };
}

const badgeClass = (entryType: string, theme: "dark" | "light") => {
  const base =
    theme === "dark"
      ? "border-zinc-600 text-zinc-300 bg-zinc-900/80"
      : "border-zinc-300 text-zinc-700 bg-zinc-100";
  if (entryType === "reply") return cn(base, "border-cyan-600/50 text-cyan-400");
  if (entryType === "utterance") return cn(base, "border-emerald-600/40 text-emerald-400");
  if (entryType === "thought") return cn(base, "border-violet-600/40 text-violet-400");
  if (entryType === "action") return cn(base, "border-amber-600/40 text-amber-400");
  return base;
};

export const SceneTimelinePanel: React.FC<SceneTimelinePanelProps> = ({
  entries,
  open,
  onClose,
  theme,
  initialPosition = { left: 56, top: 200 },
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(initialPosition);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({ left: Math.max(8, e.clientX - d.dx), top: Math.max(8, e.clientY - d.dy) });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Scene timeline"
      className={cn(
        "fixed z-[10014] flex flex-col rounded-md border shadow-2xl overflow-hidden font-mono text-[11px]",
        "w-[min(560px,calc(100vw-24px))] max-h-[min(72vh,680px)]",
        theme === "dark" ? "bg-[#0d0d0d] border-zinc-700 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className={cn(
          "flex items-center justify-between px-3 py-2 cursor-move select-none border-b",
          theme === "dark" ? "border-zinc-800 bg-zinc-950/80" : "border-zinc-200 bg-zinc-50",
        )}
      >
        <span className="uppercase tracking-widest text-[10px] opacity-80">Scene</span>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest opacity-70 hover:opacity-100">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {entries.length === 0 ? (
          <p className="text-[10px] opacity-50 px-1">No scene entries yet.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={`${entry.seq}-${entry.occurred_at}`}
              className={cn(
                "rounded border px-2 py-1.5",
                theme === "dark" ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[9px] opacity-50">{entry.occurred_at}</span>
                <span className={cn("text-[9px] px-1 py-0.5 rounded border uppercase", badgeClass(entry.entry_type, theme))}>
                  {entry.entry_type}
                </span>
                <span className="text-[9px] opacity-70">{entry.actor}</span>
                {entry.transaction_id ? (
                  <span className="text-[9px] opacity-40 truncate max-w-[140px]" title={entry.transaction_id}>
                    {entry.transaction_id.slice(0, 12)}…
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{entry.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
