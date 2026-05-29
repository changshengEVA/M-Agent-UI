import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { ThinkLifeTransaction } from "../types/chat";

interface ThinkLifeWmPanelProps {
  transactions: ThinkLifeTransaction[];
  activeTransactionId?: string | null;
  cpuTransactionId?: string | null;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  theme: "dark" | "light";
  initialPosition?: { left: number; top: number };
}

const statusClass = (status: string, theme: "dark" | "light") => {
  const base = "text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wide";
  switch (status) {
    case "running":
      return cn(base, theme === "dark" ? "border-amber-500/50 text-amber-400" : "border-amber-400 text-amber-700");
    case "waiting_execution":
      return cn(base, theme === "dark" ? "border-blue-500/50 text-blue-400" : "border-blue-400 text-blue-700");
    case "suspended":
      return cn(base, theme === "dark" ? "border-zinc-500 text-zinc-400" : "border-zinc-400 text-zinc-600");
    case "completed":
      return cn(base, theme === "dark" ? "border-emerald-600/50 text-emerald-400" : "border-emerald-500 text-emerald-700");
    case "failed":
    case "cancelled":
      return cn(base, theme === "dark" ? "border-rose-600/50 text-rose-400" : "border-rose-400 text-rose-700");
    default:
      return cn(base, theme === "dark" ? "border-zinc-600 text-zinc-400" : "border-zinc-300 text-zinc-600");
  }
};

export const ThinkLifeWmPanel: React.FC<ThinkLifeWmPanelProps> = ({
  transactions,
  activeTransactionId,
  cpuTransactionId,
  open,
  onClose,
  onRefresh,
  theme,
  initialPosition = { left: 56, top: 100 },
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(initialPosition);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))),
    [transactions],
  );

  useEffect(() => {
    if (!open) return;
    if (selectedId && sorted.some((t) => t.transaction_id === selectedId)) return;
    const preferred =
      cpuTransactionId ||
      activeTransactionId ||
      sorted.find((t) => t.is_cpu_holder)?.transaction_id ||
      sorted.find((t) => t.is_active_user)?.transaction_id ||
      sorted[0]?.transaction_id ||
      null;
    setSelectedId(preferred);
  }, [open, sorted, selectedId, activeTransactionId, cpuTransactionId]);

  const selected = sorted.find((t) => t.transaction_id === selectedId) ?? null;
  const wmJson = JSON.stringify(selected?.wm_entries ?? [], null, 2);

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
      aria-label="Think-life working memory by transaction"
      className={cn(
        "fixed z-[10016] flex flex-col rounded-md border shadow-2xl overflow-hidden font-mono text-[11px]",
        "w-[min(720px,calc(100vw-24px))] max-h-[min(75vh,720px)]",
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
          "flex cursor-grab active:cursor-grabbing items-center justify-between px-3 py-2.5 select-none border-b gap-2",
          theme === "dark" ? "border-zinc-800 bg-[#080808]" : "border-zinc-200 bg-zinc-50",
        )}
      >
        <span className="font-bold uppercase tracking-widest text-[10px] text-violet-400">
          WM · 按事务 · {sorted.length} 条
        </span>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="text-[10px] uppercase tracking-widest text-cyan-500 hover:underline"
            >
              刷新
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="text-lg leading-none opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div
          className={cn(
            "w-[42%] min-w-[200px] border-r overflow-y-auto",
            theme === "dark" ? "border-zinc-800 bg-black/20" : "border-zinc-200 bg-zinc-50/80",
          )}
        >
          {sorted.length === 0 ? (
            <p className="p-3 text-[10px] opacity-50">暂无事务（发送消息后将在此列出）</p>
          ) : (
            sorted.map((txn) => (
              <button
                key={txn.transaction_id}
                type="button"
                onClick={() => setSelectedId(txn.transaction_id)}
                className={cn(
                  "w-full text-left px-2 py-2 border-b transition-colors",
                  theme === "dark" ? "border-zinc-900 hover:bg-zinc-900/80" : "border-zinc-100 hover:bg-white",
                  selectedId === txn.transaction_id &&
                    (theme === "dark" ? "bg-violet-950/40 border-l-2 border-l-violet-500" : "bg-violet-50 border-l-2 border-l-violet-500"),
                )}
              >
                <div className="flex flex-wrap items-center gap-1 mb-1">
                  <span className={statusClass(txn.status, theme)}>{txn.status}</span>
                  <span className="text-[9px] opacity-50">{txn.kind}</span>
                  {txn.is_cpu_holder ? (
                    <span className="text-[9px] text-amber-400">CPU</span>
                  ) : null}
                  {txn.is_active_user ? (
                    <span className="text-[9px] text-cyan-400">活跃</span>
                  ) : null}
                </div>
                <div className="text-[9px] opacity-70 truncate" title={txn.transaction_id}>
                  {txn.transaction_id}
                </div>
                <div className="text-[9px] opacity-50 mt-0.5">
                  WM {txn.wm_entry_count} · 轮次 {txn.think_rounds}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <div
                className={cn(
                  "px-3 py-2 text-[10px] border-b space-y-0.5",
                  theme === "dark" ? "border-zinc-800 text-zinc-500" : "border-zinc-100 text-zinc-600",
                )}
              >
                <div>事务: {selected.transaction_id}</div>
                <div>
                  状态: {selected.status} · 委托 {selected.delegate_count} · 更新 {selected.updated_at}
                </div>
                {selected.last_error ? <div className="text-rose-400">错误: {selected.last_error}</div> : null}
              </div>
              <pre
                className={cn(
                  "flex-1 overflow-auto m-0 px-3 py-2 text-[11px] leading-relaxed",
                  theme === "dark" ? "text-emerald-200/90" : "text-emerald-900",
                )}
              >
                {selected.wm_entry_count ? wmJson : "（该事务 WM 为空）"}
              </pre>
            </>
          ) : (
            <p className="p-4 text-[10px] opacity-50">选择左侧事务查看 WM</p>
          )}
        </div>
      </div>
    </div>
  );
};
