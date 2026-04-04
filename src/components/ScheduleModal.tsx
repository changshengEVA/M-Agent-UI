import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarClock,
  Clock3,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { chatApi } from "../services/api";
import { ScheduleItem } from "../types/chat";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  threadId: string;
  refreshToken?: number;
  onApiError?: (err: any, fallbackMessage: string) => Promise<void> | void;
}

const pad = (value: number) => String(value).padStart(2, "0");

const toDateTimeLocalValue = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const buildDefaultDueAt = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30);
  date.setSeconds(0, 0);
  return toDateTimeLocalValue(date);
};

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  leased: "Leased",
  running: "Running",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
};

const statusTone = (status: string, theme: "dark" | "light") => {
  const tones: Record<string, string> = {
    pending: theme === "dark" ? "border-cyan-500/30 text-cyan-300 bg-cyan-500/10" : "border-cyan-200 text-cyan-700 bg-cyan-50",
    leased: theme === "dark" ? "border-indigo-500/30 text-indigo-300 bg-indigo-500/10" : "border-indigo-200 text-indigo-700 bg-indigo-50",
    running: theme === "dark" ? "border-violet-500/30 text-violet-300 bg-violet-500/10" : "border-violet-200 text-violet-700 bg-violet-50",
    done: theme === "dark" ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10" : "border-emerald-200 text-emerald-700 bg-emerald-50",
    failed: theme === "dark" ? "border-amber-500/30 text-amber-300 bg-amber-500/10" : "border-amber-200 text-amber-700 bg-amber-50",
    canceled: theme === "dark" ? "border-rose-500/30 text-rose-300 bg-rose-500/10" : "border-rose-200 text-rose-700 bg-rose-50",
  };
  return tones[status] || tones.pending;
};

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  theme,
  threadId,
  refreshToken = 0,
  onApiError,
}) => {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDueAt, setDraftDueAt] = useState(buildDefaultDueAt());
  const [draftTimezone, setDraftTimezone] = useState(browserTimezone());

  const activeItems = useMemo(
    () => items.filter((item) => !["done", "failed", "canceled"].includes(item.status)),
    [items],
  );

  const archivedItems = useMemo(
    () => items.filter((item) => ["done", "failed", "canceled"].includes(item.status)),
    [items],
  );

  const loadSchedules = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await chatApi.listSchedules(threadId, {
        include_completed: includeCompleted,
        limit: includeCompleted ? 100 : 60,
        keyword: appliedKeyword || undefined,
      });
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err: any) {
      const text = String(err?.message || "加载日程失败");
      setError(text);
      await onApiError?.(err, "加载日程失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, includeCompleted, isOpen, onApiError, threadId]);

  useEffect(() => {
    if (!isOpen) return;
    loadSchedules();
  }, [isOpen, threadId, includeCompleted, refreshToken, loadSchedules]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setMessage(null);
    }
  }, [isOpen]);

  const handleSearch = () => {
    const nextKeyword = keyword.trim();
    if (nextKeyword === appliedKeyword) {
      loadSchedules();
      return;
    }
    setAppliedKeyword(nextKeyword);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftTitle.trim()) {
      setError("请先写一个日程标题");
      return;
    }
    if (!draftDueAt.trim()) {
      setError("请先选择时间");
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      await chatApi.createSchedule(threadId, {
        title: draftTitle.trim(),
        prompt: draftTitle.trim(),
        due_at: draftDueAt,
        timezone_name: draftTimezone.trim() || "Asia/Shanghai",
        original_time_text: draftDueAt.replace("T", " "),
        source_text: draftTitle.trim(),
      });
      setDraftTitle("");
      setDraftDueAt(buildDefaultDueAt());
      setMessage("日程已创建");
      await loadSchedules();
    } catch (err: any) {
      const text = String(err?.message || "创建日程失败");
      setError(text);
      await onApiError?.(err, "创建日程失败");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (item: ScheduleItem) => {
    const confirmed = window.confirm(`取消日程“${item.title}”吗？`);
    if (!confirmed) return;
    setCancellingId(item.schedule_id);
    setError(null);
    setMessage(null);
    try {
      await chatApi.cancelSchedule(threadId, item.schedule_id);
      setMessage("日程已取消");
      await loadSchedules();
    } catch (err: any) {
      const text = String(err?.message || "取消日程失败");
      setError(text);
      await onApiError?.(err, "取消日程失败");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className={cn(
              "relative w-full max-w-6xl max-h-[92vh] overflow-hidden border rounded-sm shadow-2xl",
              theme === "dark" ? "bg-[#07090D] border-cyan-950/70" : "bg-white border-cyan-100",
            )}
          >
            <div
              className={cn(
                "sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between backdrop-blur",
                theme === "dark"
                  ? "border-cyan-950/50 bg-[#07090D]/95"
                  : "border-cyan-100 bg-white/95",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-sm border flex items-center justify-center",
                    theme === "dark"
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                      : "border-cyan-200 bg-cyan-50 text-cyan-700",
                  )}
                >
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className={cn("text-xs font-bold uppercase tracking-[0.28em]", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
                    Shared Schedule
                  </h2>
                  <p className="text-[10px] font-mono text-zinc-500 mt-1">Current thread: {threadId}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadSchedules}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                    theme === "dark"
                      ? "border-zinc-800 text-zinc-300 hover:text-cyan-300 hover:border-cyan-700"
                      : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-300",
                  )}
                >
                  <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                  Refresh
                </button>
                <button onClick={onClose} className="p-1 hover:bg-zinc-500/10 rounded-full transition-colors">
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] max-h-[calc(92vh-74px)]">
              <section
                className={cn(
                  "border-r p-6 overflow-y-auto",
                  theme === "dark" ? "border-cyan-950/40 bg-[#05070A]" : "border-zinc-100 bg-zinc-50/80",
                )}
              >
                <div
                  className={cn(
                    "rounded-sm border p-4 space-y-4",
                    theme === "dark"
                      ? "border-cyan-950/50 bg-cyan-500/[0.03]"
                      : "border-cyan-100 bg-white",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <h3 className={cn("text-xs font-bold uppercase tracking-widest", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                      Create Schedule
                    </h3>
                  </div>

                  <form onSubmit={handleCreate} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500">Title</label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="例如：开组会 / 交周报"
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                          theme === "dark" ? "bg-[#020407] border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500">Due Time</label>
                      <input
                        type="datetime-local"
                        value={draftDueAt}
                        onChange={(e) => setDraftDueAt(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                          theme === "dark" ? "bg-[#020407] border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500">Timezone</label>
                      <input
                        type="text"
                        value={draftTimezone}
                        onChange={(e) => setDraftTimezone(e.target.value)}
                        placeholder="Asia/Shanghai"
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                          theme === "dark" ? "bg-[#020407] border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={creating}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      {creating ? "Creating..." : "Create"}
                    </button>
                  </form>
                </div>

                <div
                  className={cn(
                    "mt-4 rounded-sm border p-4 space-y-3",
                    theme === "dark" ? "border-zinc-800 bg-zinc-950/60" : "border-zinc-200 bg-white",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-amber-500" />
                    <h3 className={cn("text-xs font-bold uppercase tracking-widest", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                      Filter
                    </h3>
                  </div>

                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜标题、描述或 schedule id"
                    className={cn(
                      "w-full px-3 py-2 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                      theme === "dark" ? "bg-[#020407] border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900",
                    )}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSearch}
                      className={cn(
                        "flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                        theme === "dark"
                          ? "border-zinc-700 text-zinc-300 hover:border-cyan-700 hover:text-cyan-300"
                          : "border-zinc-200 text-zinc-700 hover:border-cyan-300 hover:text-cyan-700",
                      )}
                    >
                      <Search className="w-3 h-3" />
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeCompleted((prev) => !prev)}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                        includeCompleted
                          ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                          : theme === "dark"
                            ? "border-zinc-700 text-zinc-300 hover:border-amber-700 hover:text-amber-300"
                            : "border-zinc-200 text-zinc-700 hover:border-amber-300 hover:text-amber-700",
                      )}
                    >
                      <History className="w-3 h-3" />
                      History
                    </button>
                  </div>
                </div>

                {(message || error) && (
                  <div
                    className={cn(
                      "mt-4 rounded-sm border px-4 py-3 text-[11px]",
                      error
                        ? theme === "dark"
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                        : theme === "dark"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {error || message}
                  </div>
                )}
              </section>

              <section className="min-h-0 overflow-y-auto p-6">
                <div className="grid gap-6">
                  <div
                    className={cn(
                      "rounded-sm border p-4",
                      theme === "dark" ? "border-cyan-950/40 bg-cyan-500/[0.02]" : "border-cyan-100 bg-cyan-50/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Upcoming Queue</p>
                        <p className={cn("mt-2 text-2xl font-semibold", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
                          {activeItems.length}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Archived</p>
                        <p className={cn("mt-2 text-2xl font-semibold", theme === "dark" ? "text-zinc-300" : "text-zinc-700")}>
                          {archivedItems.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {loading ? (
                      <div className="py-20 flex items-center justify-center text-zinc-500 gap-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Loading schedules...</span>
                      </div>
                    ) : items.length === 0 ? (
                      <div
                        className={cn(
                          "rounded-sm border px-6 py-16 text-center",
                          theme === "dark" ? "border-zinc-800 bg-zinc-950/40 text-zinc-500" : "border-zinc-200 bg-zinc-50 text-zinc-500",
                        )}
                        >
                          <CalendarClock className="w-8 h-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">当前用户还没有日程。</p>
                      </div>
                    ) : (
                      items.map((item) => (
                        <motion.div
                          key={item.schedule_id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "rounded-sm border p-4 transition-colors",
                            theme === "dark"
                              ? "border-zinc-800 bg-zinc-950/40 hover:border-cyan-800/60"
                              : "border-zinc-200 bg-white hover:border-cyan-300",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className={cn("text-sm font-semibold", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
                                  {item.title}
                                </h4>
                                <span className={cn("px-2 py-0.5 rounded-sm border text-[10px] uppercase tracking-widest", statusTone(item.status, theme))}>
                                  {statusLabel[item.status] || item.status}
                                </span>
                              </div>

                              <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                                <Clock3 className="w-3.5 h-3.5" />
                                <span>{item.due_display}</span>
                                <span className="opacity-30">•</span>
                                <span className="font-mono">{item.timezone_name}</span>
                              </div>

                              <div className="mt-2 grid gap-1 text-[11px] text-zinc-500">
                                <p>Thread: {item.thread_id || "-"}</p>
                                <p>Original: {item.original_time_text || "-"}</p>
                                <p className="font-mono">ID: {item.schedule_id}</p>
                              </div>
                            </div>

                            {!["done", "failed", "canceled"].includes(item.status) && (
                              <button
                                type="button"
                                onClick={() => handleCancel(item)}
                                disabled={cancellingId === item.schedule_id}
                                className={cn(
                                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50",
                                  theme === "dark"
                                    ? "border-rose-900/70 text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/40"
                                    : "border-rose-200 text-rose-700 hover:bg-rose-50 hover:border-rose-300",
                                )}
                              >
                                {cancellingId === item.schedule_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                Cancel
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
