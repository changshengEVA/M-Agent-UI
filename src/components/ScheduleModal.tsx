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
import { ScheduleHeartbeatStatus, ScheduleItem } from "../types/chat";

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

const formatDateTimeText = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "--";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
};

const parseTimestampMs = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatBeatCountdown = (seconds: number | null) => {
  if (seconds === null) return "--";
  if (seconds <= 0) return "Now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${pad(remainingSeconds)}`;
};

type HeartbeatVisualState = "stable" | "lagging" | "error" | "stopped";

const resolveHeartbeatVisualState = (
  heartbeat: ScheduleHeartbeatStatus | null,
  nowMs: number,
): HeartbeatVisualState => {
  if (heartbeat?.last_error) return "error";
  if (!heartbeat?.worker_alive) return "stopped";
  const intervalSeconds = Math.max(1, Number(heartbeat?.interval_seconds || heartbeat?.beat_interval_seconds || 10));
  const intervalMs = intervalSeconds * 1000;
  const nextBeatMs = parseTimestampMs(heartbeat?.next_beat_due_at);
  if (nextBeatMs !== null && nowMs - nextBeatMs >= intervalMs) {
    return "lagging";
  }
  return "stable";
};

const buildHeartbeatWavePath = (
  phase: number,
  visualState: HeartbeatVisualState,
  amplitudeScale = 1,
) => {
  const baseline = 18;
  if (visualState === "stopped") {
    return `M 0 ${baseline} L 100 ${baseline}`;
  }

  const spikeX = 12 + clamp(phase, 0, 1) * 72;
  const start = clamp(spikeX - 23, 0, 100);
  const whisperA = clamp(spikeX - 18, 0, 100);
  const whisperB = clamp(spikeX - 15, 0, 100);
  const riseA = clamp(spikeX - 10.5, 0, 100);
  const riseB = clamp(spikeX - 7.2, 0, 100);
  const preDip = clamp(spikeX - 4.6, 0, 100);
  const peak = clamp(spikeX, 0, 100);
  const drop = clamp(spikeX + 2.1, 0, 100);
  const rebound = clamp(spikeX + 5.3, 0, 100);
  const settle = clamp(spikeX + 8.8, 0, 100);
  const afterBlip = clamp(spikeX + 12.6, 0, 100);
  const tail = clamp(spikeX + 19, 0, 100);
  const peakY = baseline - 15.5 * amplitudeScale;
  const dropY = baseline + 9.2 * amplitudeScale;
  const reboundY = baseline - 5.3 * amplitudeScale;
  const afterBlipY = baseline - 2.5 * amplitudeScale;
  const smallRiseY = baseline - 2.9 * amplitudeScale;
  const smallDipY = baseline + 1.8 * amplitudeScale;

  return [
    `M 0 ${baseline}`,
    `L ${start} ${baseline}`,
    `L ${whisperA} ${baseline + 0.7 * amplitudeScale}`,
    `L ${whisperB} ${baseline - 0.9 * amplitudeScale}`,
    `L ${riseA} ${baseline}`,
    `L ${riseB} ${smallRiseY}`,
    `L ${preDip} ${smallDipY}`,
    `L ${peak} ${peakY}`,
    `L ${drop} ${dropY}`,
    `L ${rebound} ${reboundY}`,
    `L ${settle} ${baseline}`,
    `L ${afterBlip} ${afterBlipY}`,
    `L ${tail} ${baseline}`,
    `L 100 ${baseline}`,
  ].join(" ");
};

const buildHeartbeatBedPath = (phase: number, amplitudeScale = 1) => {
  const baseline = 18;
  const rippleX = 10 + clamp(phase, 0, 1) * 70;
  return [
    `M 0 ${baseline}`,
    `L ${clamp(rippleX - 30, 0, 100)} ${baseline}`,
    `L ${clamp(rippleX - 24, 0, 100)} ${baseline + 0.35 * amplitudeScale}`,
    `L ${clamp(rippleX - 18, 0, 100)} ${baseline - 0.4 * amplitudeScale}`,
    `L ${clamp(rippleX - 12, 0, 100)} ${baseline + 0.3 * amplitudeScale}`,
    `L ${clamp(rippleX - 6, 0, 100)} ${baseline - 0.25 * amplitudeScale}`,
    `L ${clamp(rippleX, 0, 100)} ${baseline}`,
    `L 100 ${baseline}`,
  ].join(" ");
};

const resolveHeartbeatPalette = (theme: "dark" | "light", visualState: HeartbeatVisualState) => {
  if (visualState === "error") {
    return theme === "dark"
      ? {
          stroke: "#f59e0b",
          glow: "rgba(245, 158, 11, 0.35)",
          chipClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
          panelClass: "border-amber-500/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_42%),linear-gradient(180deg,rgba(24,16,6,0.96),rgba(10,10,12,0.96))]",
          textClass: "text-amber-300",
        }
      : {
          stroke: "#d97706",
          glow: "rgba(217, 119, 6, 0.18)",
          chipClass: "border-amber-200 bg-amber-50 text-amber-700",
          panelClass: "border-amber-200 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_42%),linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.96))]",
          textClass: "text-amber-700",
        };
  }
  if (visualState === "lagging") {
    return theme === "dark"
      ? {
          stroke: "#facc15",
          glow: "rgba(250, 204, 21, 0.28)",
          chipClass: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
          panelClass: "border-yellow-500/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.12),transparent_40%),linear-gradient(180deg,rgba(14,14,10,0.96),rgba(8,9,11,0.96))]",
          textClass: "text-yellow-300",
        }
      : {
          stroke: "#ca8a04",
          glow: "rgba(202, 138, 4, 0.18)",
          chipClass: "border-yellow-200 bg-yellow-50 text-yellow-700",
          panelClass: "border-yellow-200 bg-[radial-gradient(circle_at_top_left,rgba(253,224,71,0.16),transparent_40%),linear-gradient(180deg,rgba(254,252,232,0.96),rgba(255,255,255,0.96))]",
          textClass: "text-yellow-700",
        };
  }
  if (visualState === "stopped") {
    return theme === "dark"
      ? {
          stroke: "#71717a",
          glow: "rgba(113, 113, 122, 0.18)",
          chipClass: "border-zinc-600/40 bg-zinc-800/60 text-zinc-300",
          panelClass: "border-zinc-700/40 bg-[radial-gradient(circle_at_top_left,rgba(113,113,122,0.12),transparent_40%),linear-gradient(180deg,rgba(12,12,16,0.96),rgba(8,9,11,0.96))]",
          textClass: "text-zinc-300",
        }
      : {
          stroke: "#71717a",
          glow: "rgba(113, 113, 122, 0.12)",
          chipClass: "border-zinc-200 bg-zinc-100 text-zinc-700",
          panelClass: "border-zinc-200 bg-[radial-gradient(circle_at_top_left,rgba(161,161,170,0.12),transparent_40%),linear-gradient(180deg,rgba(244,244,245,0.96),rgba(255,255,255,0.96))]",
          textClass: "text-zinc-700",
        };
  }
  return theme === "dark"
    ? {
        stroke: "#34d399",
        glow: "rgba(52, 211, 153, 0.32)",
        chipClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        panelClass: "border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_42%),linear-gradient(180deg,rgba(6,18,14,0.96),rgba(8,9,11,0.96))]",
        textClass: "text-emerald-300",
      }
    : {
        stroke: "#059669",
        glow: "rgba(5, 150, 105, 0.16)",
        chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        panelClass: "border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.18),transparent_42%),linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.96))]",
        textClass: "text-emerald-700",
      };
};

interface HeartbeatMonitorCardProps {
  heartbeat: ScheduleHeartbeatStatus | null;
  heartbeatLoading: boolean;
  nowMs: number;
  theme: "dark" | "light";
}

const HeartbeatMonitorCard: React.FC<HeartbeatMonitorCardProps> = ({
  heartbeat,
  heartbeatLoading,
  nowMs,
  theme,
}) => {
  const intervalSeconds = Math.max(1, Number(heartbeat?.interval_seconds || heartbeat?.beat_interval_seconds || 10));
  const intervalMs = intervalSeconds * 1000;
  const lastBeatMs = parseTimestampMs(heartbeat?.last_beat_finished_at || heartbeat?.last_beat_started_at);
  const nextBeatMs = parseTimestampMs(heartbeat?.next_beat_due_at);
  const secondsUntilNext = nextBeatMs === null ? null : Math.max(0, Math.ceil((nextBeatMs - nowMs) / 1000));
  const phase = nextBeatMs !== null
    ? clamp(1 - (nextBeatMs - nowMs) / intervalMs, 0, 1)
    : lastBeatMs !== null
      ? clamp((nowMs - lastBeatMs) / intervalMs, 0, 1)
      : 0.18;
  const visualState = resolveHeartbeatVisualState(heartbeat, nowMs);
  const palette = resolveHeartbeatPalette(theme, visualState);
  const primaryAmplitude = visualState === "error" ? 1.18 : visualState === "lagging" ? 1.06 : 1;
  const secondaryAmplitude = visualState === "error" ? 0.58 : 0.52;
  const primaryPath = buildHeartbeatWavePath(phase, visualState, primaryAmplitude);
  const echoPath = buildHeartbeatWavePath(clamp(phase - 0.18, 0, 1), visualState, secondaryAmplitude);
  const bedPath = buildHeartbeatBedPath(phase, visualState === "stopped" ? 0.2 : 1);
  const scanLeft = `${12 + phase * 72}%`;
  const beamWidth = visualState === "error" ? "20%" : visualState === "lagging" ? "18%" : "16%";
  const beamOpacity = heartbeatLoading ? 0.95 : visualState === "stable" ? 0.85 : 0.72;
  const pulseX = 12 + phase * 72;
  const pulseStrength = visualState === "stopped"
    ? 0.18
    : clamp(0.45 + (1 - Math.abs(phase - 0.5) * 1.8), 0.45, visualState === "error" ? 1.5 : 1.18);
  const statusLabel = visualState === "error"
    ? "Needs Attention"
    : visualState === "lagging"
      ? "Lagging"
      : visualState === "stopped"
        ? "Stopped"
        : heartbeatLoading
          ? "Syncing"
          : "Nominal";
  const leadLabel = heartbeat?.worker_alive
    ? `T-${formatBeatCountdown(secondsUntilNext)}`
    : "OFF";

  return (
    <div className={cn("rounded-sm border p-4", palette.panelClass)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Heartbeat Monitor</p>
          <p className={cn("mt-2 text-xl font-semibold", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            Every {intervalSeconds}s
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            The trace advances with the real scheduler window instead of looping as a fake animation.
          </p>
        </div>

        <div className="text-right">
          <span className={cn("inline-flex items-center rounded-sm border px-2.5 py-1 text-[10px] uppercase tracking-[0.24em]", palette.chipClass)}>
            {statusLabel}
          </span>
          <p className={cn("mt-3 text-3xl font-semibold tabular-nums", palette.textClass)}>
            {leadLabel}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Next trigger window
          </p>
        </div>
      </div>

      <div
        className={cn(
          "relative mt-5 overflow-hidden rounded-sm border",
          theme === "dark" ? "border-white/8 bg-[#020606]" : "border-white/80 bg-[#fbfffd]",
        )}
      >
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              theme === "dark"
                ? "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(rgba(52,211,153,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,0.04) 1px, transparent 1px)"
                : "linear-gradient(rgba(24,24,27,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.06) 1px, transparent 1px), linear-gradient(rgba(5,150,105,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(5,150,105,0.04) 1px, transparent 1px)",
            backgroundSize: "26px 26px, 26px 26px, 104px 104px, 104px 104px",
          }}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            theme === "dark"
              ? "bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_60%)]"
              : "bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.06),transparent_60%)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 right-0 top-1/2 border-t",
            theme === "dark" ? "border-white/10" : "border-zinc-300/60",
          )}
        />
        <motion.div
          className="pointer-events-none absolute inset-y-2 z-10"
          animate={{ left: scanLeft, opacity: beamOpacity }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          style={{
            width: beamWidth,
            transform: "translateX(-50%)",
            background: `linear-gradient(90deg, transparent 0%, ${palette.glow} 18%, ${palette.stroke} 50%, ${palette.glow} 82%, transparent 100%)`,
            boxShadow: `0 0 24px ${palette.glow}, 0 0 56px ${palette.glow}`,
            filter: "blur(0.4px)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute z-20 rounded-full"
          animate={{
            left: `${pulseX}%`,
            top: "50%",
            opacity: visualState === "stopped" ? 0.18 : 0.45 + pulseStrength * 0.22,
            scale: visualState === "stopped" ? 0.8 : 0.95 + pulseStrength * 0.38,
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{
            width: 16,
            height: 16,
            transform: "translate(-50%, -50%)",
            background: palette.stroke,
            boxShadow: `0 0 18px ${palette.glow}, 0 0 42px ${palette.glow}`,
          }}
        />
        <svg viewBox="0 0 100 36" className="relative z-20 h-40 w-full">
          <path
            d={bedPath}
            fill="none"
            stroke={palette.stroke}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.18"
          />
          <path
            d={echoPath}
            fill="none"
            stroke={palette.stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.34"
          />
          <path
            d={primaryPath}
            fill="none"
            stroke={palette.stroke}
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 14px ${palette.glow}) drop-shadow(0 0 28px ${palette.glow})` }}
          />
        </svg>

        <div className="pointer-events-none absolute left-4 top-3 z-30">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Live Trace</p>
          <p className={cn("mt-1 text-xs font-medium", palette.textClass)}>
            {visualState === "error"
              ? "Recent beat failed"
              : visualState === "lagging"
                ? "Scheduler is behind the expected window"
                : visualState === "stopped"
                  ? "Worker is not running"
                  : "Sweep and pulse are synced to the real scheduler cadence"}
          </p>
        </div>

        <div className="pointer-events-none absolute right-4 top-3 z-30 text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Beam Intensity</p>
          <p className={cn("mt-1 text-xs font-medium tabular-nums", palette.textClass)}>
            {(pulseStrength * 100).toFixed(0)}%
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-4 z-30 text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Beats / Busy / Failed</p>
          <p className={cn("mt-1 text-sm font-semibold tabular-nums", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            {heartbeat?.beats_total ?? 0} / {heartbeat?.items_busy_retried ?? 0} / {heartbeat?.items_failed ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-[11px]">
        <div className={cn("rounded-sm border px-3 py-2", theme === "dark" ? "border-white/8 bg-black/20" : "border-zinc-100 bg-zinc-50")}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Last Beat</p>
          <p className={cn("mt-1 tabular-nums", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            {formatDateTimeText(heartbeat?.last_beat_finished_at || heartbeat?.last_beat_started_at)}
          </p>
        </div>
        <div className={cn("rounded-sm border px-3 py-2", theme === "dark" ? "border-white/8 bg-black/20" : "border-zinc-100 bg-zinc-50")}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Next Beat</p>
          <p className={cn("mt-1 tabular-nums", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            {formatDateTimeText(heartbeat?.next_beat_due_at)}
          </p>
        </div>
        <div className={cn("rounded-sm border px-3 py-2", theme === "dark" ? "border-white/8 bg-black/20" : "border-zinc-100 bg-zinc-50")}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Busy Retry</p>
          <p className={cn("mt-1 tabular-nums", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            {heartbeat?.busy_retry_seconds || 5}s
          </p>
        </div>
        <div className={cn("rounded-sm border px-3 py-2", theme === "dark" ? "border-white/8 bg-black/20" : "border-zinc-100 bg-zinc-50")}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Completed</p>
          <p className={cn("mt-1 tabular-nums", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            {heartbeat?.items_completed ?? 0}
          </p>
        </div>
      </div>

      {heartbeat?.last_error ? (
        <div
          className={cn(
            "mt-3 rounded-sm border px-3 py-2 text-[11px]",
            theme === "dark"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          Last heartbeat error: {heartbeat.last_error}
        </div>
      ) : null}
    </div>
  );
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
  const [heartbeat, setHeartbeat] = useState<ScheduleHeartbeatStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
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
  const [nowMs, setNowMs] = useState(() => Date.now());

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
      if (payload.heartbeat) {
        setHeartbeat(payload.heartbeat);
      }
    } catch (err: any) {
      const text = String(err?.message || "加载日程失败");
      setError(text);
      await onApiError?.(err, "加载日程失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, includeCompleted, isOpen, onApiError, threadId]);

  const loadHeartbeat = useCallback(async () => {
    if (!isOpen) return;
    setHeartbeatLoading(true);
    try {
      const payload = await chatApi.getScheduleHeartbeat(threadId);
      setHeartbeat(payload.heartbeat || null);
    } catch (err: any) {
      await onApiError?.(err, "鍔犺浇 heartbeat 鐘舵€佸け璐?");
    } finally {
      setHeartbeatLoading(false);
    }
  }, [isOpen, onApiError, threadId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadSchedules(), loadHeartbeat()]);
  }, [loadHeartbeat, loadSchedules]);

  useEffect(() => {
    if (!isOpen) return;
    loadAll();
  }, [isOpen, threadId, includeCompleted, refreshToken, loadAll]);

  useEffect(() => {
    if (!isOpen) return;
    const intervalSeconds = Math.max(1, Number(heartbeat?.interval_seconds || heartbeat?.beat_interval_seconds || 10));
    const refreshMs = Math.min(3000, Math.max(2000, Math.floor((intervalSeconds * 1000) / 4)));
    const timer = window.setInterval(() => {
      loadHeartbeat();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [heartbeat?.beat_interval_seconds, heartbeat?.interval_seconds, isOpen, loadHeartbeat]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setMessage(null);
      setHeartbeat(null);
    }
  }, [isOpen]);

  const handleSearch = () => {
    const nextKeyword = keyword.trim();
    if (nextKeyword === appliedKeyword) {
      loadAll();
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
                  onClick={loadAll}
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

                  <HeartbeatMonitorCard
                    heartbeat={heartbeat}
                    heartbeatLoading={heartbeatLoading}
                    nowMs={nowMs}
                    theme={theme}
                  />

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
                                <span>{item.schedule_kind === "before_event" ? `提醒 ${item.due_display}` : item.due_display}</span>
                                <span className="opacity-30">•</span>
                                <span className="font-mono">{item.timezone_name}</span>
                              </div>
                              {item.event_display && (
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                                  <CalendarClock className="w-3.5 h-3.5" />
                                  <span>事件 {item.event_display}</span>
                                  {item.reminder_offset_label && (
                                    <span className="opacity-70">提前{item.reminder_offset_label}</span>
                                  )}
                                </div>
                              )}

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
