import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { WorkingMemoryState } from "../types/chat";

interface WorkingMemoryFloatingPanelProps {
  wm: WorkingMemoryState | undefined;
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  initialPosition?: { left: number; top: number };
}

export const WorkingMemoryFloatingPanel: React.FC<WorkingMemoryFloatingPanelProps> = ({
  wm,
  open,
  onClose,
  theme,
  initialPosition = { left: 56, top: 100 },
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
    const left = Math.max(8, e.clientX - d.dx);
    const top = Math.max(8, e.clientY - d.dy);
    setPos({ left, top });
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

  const entries = Array.isArray(wm?.entries) ? wm.entries : [];
  const json = JSON.stringify(entries, null, 2);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Working memory"
      className={cn(
        "fixed z-[10015] flex flex-col rounded-md border shadow-2xl overflow-hidden font-mono text-[11px]",
        "w-[min(520px,calc(100vw-24px))] max-h-[min(70vh,640px)]",
        theme === "dark" ? "bg-[#0d0d0d] border-zinc-700 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        className={cn(
          "flex cursor-grab active:cursor-grabbing items-center justify-between px-3 py-2.5 select-none border-b",
          theme === "dark" ? "border-zinc-800 bg-[#080808]" : "border-zinc-200 bg-zinc-50",
        )}
      >
        <span className="font-bold uppercase tracking-widest text-[10px] text-cyan-500">
          工作记忆 · {wm?.stored_entries ?? 0} 条
        </span>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded p-1 text-lg leading-none transition-colors hover:bg-white/10",
            theme === "dark" ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-500 hover:text-zinc-900",
          )}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div
        className={cn(
          "px-3 py-2 text-[10px] opacity-80 border-b",
          theme === "dark" ? "border-zinc-800 text-zinc-500" : "border-zinc-100 text-zinc-600",
        )}
      >
        enabled={String(wm?.enabled ?? false)} · inject_max={wm?.inject_max_entries ?? "—"} · ui_tail=
        {wm?.ui_expose_max_entries ?? "—"}
      </div>
      <pre
        className={cn(
          "flex-1 overflow-auto m-0 px-3 py-2 text-[11px] leading-relaxed",
          theme === "dark" ? "text-emerald-200/90" : "text-emerald-900",
        )}
      >
        {entries.length ? json : "（暂无条目）"}
      </pre>
    </div>
  );
};
