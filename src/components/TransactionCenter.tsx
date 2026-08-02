import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CirclePause,
  Clock3,
  Copy,
  Cpu,
  Database,
  FileJson,
  Info,
  Layers3,
  ListTodo,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "../lib/utils";
import type {
  RuntimeTransaction,
  RuntimeTransactionDeleteResponse,
  SceneEntry,
  WorkingMemoryState,
} from "../types/chat";
import { isProductRuntimeProfile } from "../lib/runtimeState";

type Theme = "dark" | "light";
type TransactionFilter = "open" | "paused" | "closed" | "all";
type DetailTab = "overview" | "task" | "wm" | "scene";
type TransactionState = "continue" | "pause" | "complete" | "archive";

interface TaskStateProjection {
  goal?: string;
  completion_status?: string;
  completed?: string[];
  remaining?: string[];
}

/** Fields added by the authoritative product transaction projection. */
type TransactionProjection = RuntimeTransaction & {
  conversation_id?: string;
  state?: string;
  lifecycle_status?: string;
  pause_reason?: string | null;
  revision?: number;
  current_activation_id?: string | null;
  deleted?: boolean;
  task_state?: TaskStateProjection;
  runtime_engine?: string;
};

export interface TransactionCenterProps {
  transactions: RuntimeTransaction[];
  activeTransactionId?: string | null;
  cpuTransactionId?: string | null;
  sceneEntries?: SceneEntry[];
  runtimeProfile?: string;
  theme: Theme;
  loading?: boolean;
  error?: string | null;
  lastUpdated?: string | number | Date | null;
  onRefresh?: () => void | Promise<void>;
  onDeleteTransaction?: (
    transaction: RuntimeTransaction,
  ) => Promise<RuntimeTransactionDeleteResponse | void>;
  /** Changes after a flush to clear stale detail and confirmation state. */
  resetToken?: string | number;
  /** Thread-scoped WM used only by runtimes that do not expose transactions. */
  legacyWorkingMemory?: WorkingMemoryState | null;
  className?: string;
}

const FILTERS: Array<{ id: TransactionFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "paused", label: "Paused" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "task", label: "Task" },
  { id: "wm", label: "WM" },
  { id: "scene", label: "Scene" },
];

const normalize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const humanize = (value: unknown): string => {
  const normalized = normalize(value);
  if (!normalized) return "—";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getLifecycle = (transaction: TransactionProjection): string => {
  if (transaction.deleted) return "deleted";
  return normalize(transaction.lifecycle_status) || "active";
};

/**
 * `state` is authoritative. The old compatibility status is consulted only for
 * older servers, so a rolling frontend/backend upgrade remains usable.
 */
const getState = (transaction: TransactionProjection): TransactionState => {
  const state = normalize(transaction.state);
  if (
    state === "continue" ||
    state === "pause" ||
    state === "complete" ||
    state === "archive"
  ) {
    return state;
  }

  switch (normalize(transaction.status)) {
    case "suspended":
    case "failed":
      return "pause";
    case "completed":
      return "complete";
    case "cancelled":
      return "archive";
    default:
      return "continue";
  }
};

const isClosed = (transaction: TransactionProjection): boolean =>
  getLifecycle(transaction) === "deleted" ||
  getState(transaction) === "complete" ||
  getState(transaction) === "archive";

const transactionSortRank = (
  transaction: TransactionProjection,
  activeTransactionId?: string | null,
  cpuTransactionId?: string | null,
): number => {
  const isCpuHolder =
    cpuTransactionId !== undefined
      ? transaction.transaction_id === cpuTransactionId
      : transaction.is_cpu_holder;
  const isActiveUser =
    activeTransactionId !== undefined
      ? transaction.transaction_id === activeTransactionId
      : transaction.is_active_user;
  if (isCpuHolder) {
    return 0;
  }
  if (isActiveUser) {
    return 1;
  }
  if (getLifecycle(transaction) === "deleted") return 6;
  switch (getState(transaction)) {
    case "continue":
      return 2;
    case "pause":
      return 3;
    case "complete":
      return 4;
    case "archive":
      return 5;
  }
};

const matchesFilter = (
  transaction: TransactionProjection,
  filter: TransactionFilter,
): boolean => {
  if (filter === "all") return true;
  if (filter === "closed") return isClosed(transaction);
  if (getLifecycle(transaction) === "deleted") return false;
  if (filter === "paused") return getState(transaction) === "pause";
  return getState(transaction) === "continue";
};

interface StatusPresentation {
  label: string;
  detail: string;
  tone: "cyan" | "amber" | "emerald" | "rose" | "zinc" | "violet";
}

const getStatusPresentation = (
  transaction: TransactionProjection,
  isCpuHolder: boolean,
): StatusPresentation => {
  if (getLifecycle(transaction) === "deleted") {
    return {
      label: "Deleted",
      detail: "Removed from the active transaction lifecycle.",
      tone: "zinc",
    };
  }

  const state = getState(transaction);
  if (state === "continue") {
    if (isCpuHolder) {
      return {
        label: "Executing",
        detail: "This transaction currently owns the runtime CPU.",
        tone: "cyan",
      };
    }
    if (transaction.active_delegate_id) {
      return {
        label: "Awaiting tool",
        detail: "A delegated operation is still active.",
        tone: "violet",
      };
    }
    return {
      label: "Ready",
      detail: "The transaction can continue when scheduled.",
      tone: "cyan",
    };
  }
  if (state === "pause") {
    switch (normalize(transaction.pause_reason)) {
      case "awaiting_user":
        return {
          label: "Awaiting you",
          detail: "The task needs input from the active user.",
          tone: "amber",
        };
      case "scheduled_wait":
        return {
          label: "Scheduled wait",
          detail: "The transaction is waiting for its scheduled time.",
          tone: "violet",
        };
      case "runtime_error":
        return {
          label: "Error pause",
          detail: "The runtime paused this transaction after an error.",
          tone: "rose",
        };
      case "manual_hold":
        return {
          label: "On hold",
          detail: "The transaction was paused manually.",
          tone: "amber",
        };
      default:
        return {
          label: "Paused",
          detail: "The transaction is not currently advancing.",
          tone: "amber",
        };
    }
  }
  if (state === "complete") {
    return {
      label: "Complete",
      detail: "Work is complete and remains available until flush.",
      tone: "emerald",
    };
  }
  return {
    label: "Archived",
    detail: "This completed transaction was archived by a memory flush.",
    tone: "zinc",
  };
};

const toneClasses = (
  tone: StatusPresentation["tone"],
  theme: Theme,
): string => {
  const dark = theme === "dark";
  switch (tone) {
    case "cyan":
      return dark
        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
        : "border-cyan-300 bg-cyan-50 text-cyan-700";
    case "amber":
      return dark
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-amber-300 bg-amber-50 text-amber-700";
    case "emerald":
      return dark
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "rose":
      return dark
        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
        : "border-rose-300 bg-rose-50 text-rose-700";
    case "violet":
      return dark
        ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
        : "border-violet-300 bg-violet-50 text-violet-700";
    default:
      return dark
        ? "border-zinc-700 bg-zinc-800/50 text-zinc-400"
        : "border-zinc-300 bg-zinc-100 text-zinc-600";
  }
};

const formatTimestamp = (value: unknown): string => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatUpdated = (value: unknown): string => {
  if (!value) return "Not updated";
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${formatTimestamp(date)}`;
};

const CopyButton: React.FC<{
  value: string;
  label: string;
  theme: Theme;
}> = ({ value, label, theme }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors",
        copied
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
          : theme === "dark"
            ? "border-zinc-700 text-zinc-500 hover:text-cyan-400"
            : "border-zinc-300 text-zinc-500 hover:text-cyan-600",
      )}
    >
      {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
};

const transactionGoal = (transaction: TransactionProjection): string =>
  String(transaction.task_state?.goal || "").trim() ||
  `${humanize(transaction.kind)} transaction`;

const taskCounts = (
  transaction: TransactionProjection,
): { complete: number; total: number } => {
  const complete = transaction.task_state?.completed?.length ?? 0;
  const remaining = transaction.task_state?.remaining?.length ?? 0;
  return { complete, total: complete + remaining };
};

const compactValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const entryTitle = (entry: Record<string, unknown>, index: number): string => {
  const preferredKeys = ["title", "name", "type", "fact", "summary", "key"];
  for (const key of preferredKeys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `Memory entry ${index + 1}`;
};

const StatusIcon: React.FC<{
  presentation: StatusPresentation;
  className?: string;
}> = ({ presentation, className }) => {
  if (presentation.tone === "rose") return <AlertCircle className={className} />;
  if (presentation.tone === "emerald") {
    return <CheckCircle2 className={className} />;
  }
  if (presentation.tone === "amber" || presentation.tone === "violet") {
    return <CirclePause className={className} />;
  }
  if (presentation.tone === "zinc") return <Circle className={className} />;
  return <Activity className={className} />;
};

const StateBadge: React.FC<{
  transaction: TransactionProjection;
  isCpuHolder: boolean;
  theme: Theme;
}> = ({ transaction, isCpuHolder, theme }) => {
  const presentation = getStatusPresentation(transaction, isCpuHolder);
  return (
    <span
      title={`${presentation.detail} state=${getState(transaction)}`}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em]",
        toneClasses(presentation.tone, theme),
      )}
    >
      <StatusIcon presentation={presentation} className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{presentation.label}</span>
      <span className="shrink-0 opacity-60">· {getState(transaction)}</span>
    </span>
  );
};

const Marker: React.FC<{
  type: "cpu" | "user";
  theme: Theme;
}> = ({ type, theme }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider",
      type === "cpu"
        ? theme === "dark"
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
          : "border-cyan-300 bg-cyan-50 text-cyan-700"
        : theme === "dark"
          ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
          : "border-violet-300 bg-violet-50 text-violet-700",
    )}
  >
    {type === "cpu" ? (
      <Cpu className="h-2.5 w-2.5" />
    ) : (
      <UserRound className="h-2.5 w-2.5" />
    )}
    {type === "cpu" ? "CPU" : "Active user"}
  </span>
);

const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  detail: string;
  theme: Theme;
}> = ({ icon, title, detail, theme }) => (
  <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
    <div
      className={cn(
        "mb-3 flex h-9 w-9 items-center justify-center rounded-full border",
        theme === "dark"
          ? "border-zinc-800 bg-zinc-900 text-zinc-500"
          : "border-zinc-200 bg-zinc-50 text-zinc-400",
      )}
    >
      {icon ?? <Layers3 className="h-4 w-4" />}
    </div>
    <p
      className={cn(
        "text-[11px] font-semibold",
        theme === "dark" ? "text-zinc-300" : "text-zinc-700",
      )}
    >
      {title}
    </p>
    <p className="mt-1 max-w-52 text-[9px] leading-relaxed text-zinc-500">
      {detail}
    </p>
  </div>
);

const WorkingMemoryEntries: React.FC<{
  entries: Record<string, unknown>[];
  theme: Theme;
  rawOpen: boolean;
  onToggleRaw: () => void;
}> = ({ entries, theme, rawOpen, onToggleRaw }) => (
  <div className="space-y-2.5">
    {entries.length === 0 ? (
      <EmptyState
        icon={<Database className="h-4 w-4" />}
        title="Working memory is empty"
        detail="No transaction-owned WM entries have been recorded yet."
        theme={theme}
      />
    ) : (
      <div className="space-y-2">
        {entries.map((entry, index) => {
          const fields = Object.entries(entry);
          return (
            <details
              key={`${index}-${entryTitle(entry, index)}`}
              className={cn(
                "group overflow-hidden rounded-md border",
                theme === "dark"
                  ? "border-zinc-800 bg-zinc-900/35"
                  : "border-zinc-200 bg-white",
              )}
            >
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 transition-colors group-open:border-b",
                  theme === "dark"
                    ? "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70"
                    : "border-zinc-100 bg-zinc-50 hover:bg-zinc-100",
                )}
              >
                <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600 transition-transform group-open:rotate-90" />
                <Database className="h-3 w-3 shrink-0 text-cyan-500" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[10px] font-semibold",
                    theme === "dark" ? "text-zinc-200" : "text-zinc-800",
                  )}
                  title={entryTitle(entry, index)}
                >
                  {entryTitle(entry, index)}
                </span>
                <span className="text-[8px] text-zinc-600">#{index + 1}</span>
              </summary>
              <dl className="divide-y divide-zinc-500/10 px-2.5">
                {fields.length === 0 ? (
                  <div className="py-2 text-[9px] italic text-zinc-500">
                    Empty object
                  </div>
                ) : (
                  fields.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 py-1.5">
                      <dt className="truncate text-[8px] uppercase tracking-wide text-zinc-600" title={key}>
                        {humanize(key)}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 break-words text-[9px] leading-relaxed",
                          theme === "dark" ? "text-zinc-300" : "text-zinc-700",
                        )}
                      >
                        {compactValue(value)}
                      </dd>
                    </div>
                  ))
                )}
              </dl>
            </details>
          );
        })}
      </div>
    )}

    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={onToggleRaw}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[9px] font-semibold uppercase tracking-wider transition-colors",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
        )}
        aria-expanded={rawOpen}
      >
        {rawOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <FileJson className="h-3 w-3" />
        Raw JSON
        <span className="ml-auto font-normal normal-case text-zinc-600">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </button>
      <CopyButton
        value={JSON.stringify(entries, null, 2)}
        label="Copy working-memory JSON"
        theme={theme}
      />
    </div>
    {rawOpen ? (
      <pre
        className={cn(
          "max-h-72 overflow-auto rounded-md border p-2.5 text-[9px] leading-relaxed",
          theme === "dark"
            ? "border-zinc-800 bg-black/40 text-emerald-200/80"
            : "border-zinc-200 bg-zinc-950 text-emerald-300",
        )}
      >
        {JSON.stringify(entries, null, 2)}
      </pre>
    ) : null}
  </div>
);

const InfoRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  theme: Theme;
}> = ({ label, value, mono = false, theme }) => (
  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b border-zinc-500/10 py-2 last:border-b-0">
    <dt className="text-[8px] font-semibold uppercase tracking-wider text-zinc-600">
      {label}
    </dt>
    <dd
      className={cn(
        "min-w-0 break-words text-right text-[9px]",
        mono && "font-mono",
        theme === "dark" ? "text-zinc-300" : "text-zinc-700",
      )}
    >
      {value ?? "—"}
    </dd>
  </div>
);

const TransactionCard: React.FC<{
  transaction: TransactionProjection;
  isCpuHolder: boolean;
  isActiveUser: boolean;
  selected: boolean;
  theme: Theme;
  onClick: () => void;
}> = ({
  transaction,
  isCpuHolder,
  isActiveUser,
  selected,
  theme,
  onClick,
}) => {
  const counts = taskCounts(transaction);
  const goal = transactionGoal(transaction);
  const wmCount = transaction.wm_entries?.length ?? transaction.wm_entry_count ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-md border p-2.5 text-left transition-colors",
        selected
          ? theme === "dark"
            ? "border-cyan-500/50 bg-cyan-950/20"
            : "border-cyan-400 bg-cyan-50/70"
          : theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25 hover:border-zinc-700 hover:bg-zinc-900/60"
            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          isCpuHolder
            ? "bg-cyan-400"
            : getState(transaction) === "pause"
              ? "bg-amber-400"
              : isClosed(transaction)
                ? "bg-zinc-600"
                : "bg-transparent",
        )}
      />
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            <StateBadge
              transaction={transaction}
              isCpuHolder={isCpuHolder}
              theme={theme}
            />
            {isCpuHolder ? <Marker type="cpu" theme={theme} /> : null}
            {isActiveUser ? <Marker type="user" theme={theme} /> : null}
          </div>
          <h3
            className={cn(
              "line-clamp-2 text-[10px] font-semibold leading-relaxed",
              theme === "dark"
                ? "text-zinc-200 group-hover:text-white"
                : "text-zinc-800 group-hover:text-zinc-950",
            )}
            title={goal}
          >
            {goal}
          </h3>
        </div>
        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[8px] text-zinc-600">
        <span className="truncate uppercase tracking-wide">
          {humanize(transaction.kind)}
        </span>
        <span>·</span>
        <span>P{transaction.priority ?? "—"}</span>
        <span className="ml-auto shrink-0">
          {formatTimestamp(transaction.updated_at)}
        </span>
      </div>

      <div
        className={cn(
          "mt-2 grid grid-cols-4 divide-x rounded border py-1.5 text-center",
          theme === "dark"
            ? "divide-zinc-800 border-zinc-800 bg-black/20"
            : "divide-zinc-200 border-zinc-200 bg-zinc-50",
        )}
      >
        <div>
          <span className="block text-[7px] uppercase text-zinc-600">Task</span>
          <span
            className={cn(
              "text-[9px] font-semibold",
              theme === "dark" ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            {counts.total ? `${counts.complete}/${counts.total}` : "—"}
          </span>
        </div>
        <div>
          <span className="block text-[7px] uppercase text-zinc-600">WM</span>
          <span
            className={cn(
              "text-[9px] font-semibold",
              theme === "dark" ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            {wmCount}
          </span>
        </div>
        <div>
          <span className="block text-[7px] uppercase text-zinc-600">Rounds</span>
          <span
            className={cn(
              "text-[9px] font-semibold",
              theme === "dark" ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            {transaction.think_rounds ?? 0}
          </span>
        </div>
        <div>
          <span className="block text-[7px] uppercase text-zinc-600">Delegate</span>
          <span
            className={cn(
              "text-[9px] font-semibold",
              transaction.active_delegate_id
                ? "text-violet-400"
                : theme === "dark"
                  ? "text-zinc-300"
                  : "text-zinc-700",
            )}
          >
            {transaction.delegate_count ?? 0}
          </span>
        </div>
      </div>

      {transaction.last_error ? (
        <p className="mt-2 line-clamp-2 rounded bg-rose-500/10 px-2 py-1 text-[8px] leading-relaxed text-rose-400">
          {transaction.last_error}
        </p>
      ) : null}
    </button>
  );
};

const OverviewTab: React.FC<{
  transaction: TransactionProjection;
  isCpuHolder: boolean;
  isActiveUser: boolean;
  theme: Theme;
}> = ({ transaction, isCpuHolder, isActiveUser, theme }) => {
  const presentation = getStatusPresentation(transaction, isCpuHolder);
  return (
    <div className="space-y-3">
      <section
        className={cn(
          "rounded-md border p-3",
          toneClasses(presentation.tone, theme),
        )}
      >
        <div className="flex items-start gap-2.5">
          <StatusIcon presentation={presentation} className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[11px] font-bold">{presentation.label}</h3>
              {isCpuHolder ? <Marker type="cpu" theme={theme} /> : null}
              {isActiveUser ? <Marker type="user" theme={theme} /> : null}
            </div>
            <p className="mt-1 text-[9px] leading-relaxed opacity-80">
              {presentation.detail}
            </p>
          </div>
        </div>
      </section>

      {transaction.last_error ? (
        <section
          className={cn(
            "rounded-md border p-2.5",
            theme === "dark"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-rose-200 bg-rose-50 text-rose-700",
          )}
        >
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
            <AlertCircle className="h-3 w-3" />
            Last error
          </div>
          <p className="break-words text-[9px] leading-relaxed">
            {transaction.last_error}
          </p>
        </section>
      ) : null}

      <section
        className={cn(
          "rounded-md border px-2.5",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25"
            : "border-zinc-200 bg-white",
        )}
      >
        <dl>
          <InfoRow label="State" value={getState(transaction)} mono theme={theme} />
          <InfoRow
            label="Lifecycle"
            value={getLifecycle(transaction)}
            mono
            theme={theme}
          />
          <InfoRow
            label="Compat status"
            value={transaction.status || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Pause reason"
            value={transaction.pause_reason || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Kind / priority"
            value={`${transaction.kind || "—"} · P${transaction.priority ?? "—"}`}
            mono
            theme={theme}
          />
          <InfoRow
            label="Revision"
            value={transaction.revision ?? "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Think rounds"
            value={transaction.think_rounds ?? 0}
            mono
            theme={theme}
          />
          <InfoRow
            label="Delegates"
            value={
              transaction.active_delegate_id
                ? `${transaction.delegate_count ?? 0} · active`
                : transaction.delegate_count ?? 0
            }
            mono
            theme={theme}
          />
          <InfoRow
            label="Schedule"
            value={transaction.schedule_id || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Engine"
            value={transaction.runtime_engine || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Created"
            value={formatTimestamp(transaction.created_at)}
            theme={theme}
          />
          <InfoRow
            label="Updated"
            value={formatTimestamp(transaction.updated_at)}
            theme={theme}
          />
          <InfoRow
            label="Terminal"
            value={formatTimestamp(transaction.terminal_at)}
            theme={theme}
          />
        </dl>
      </section>

      <section
        className={cn(
          "rounded-md border px-2.5",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25"
            : "border-zinc-200 bg-white",
        )}
      >
        <dl>
          <InfoRow
            label="Transaction"
            value={
              <span className="flex min-w-0 items-start justify-end gap-1.5">
                <span className="min-w-0 break-all">{transaction.transaction_id}</span>
                <CopyButton
                  value={transaction.transaction_id}
                  label="Copy transaction ID"
                  theme={theme}
                />
              </span>
            }
            mono
            theme={theme}
          />
          <InfoRow
            label="Conversation"
            value={transaction.conversation_id || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Activation"
            value={transaction.current_activation_id || "—"}
            mono
            theme={theme}
          />
          <InfoRow
            label="Delegate"
            value={transaction.active_delegate_id || "—"}
            mono
            theme={theme}
          />
        </dl>
      </section>
    </div>
  );
};

const cleanupValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "none");
};

export interface TransactionDangerZoneProps {
  transaction: RuntimeTransaction;
  theme: Theme;
  confirmOpen: boolean;
  deleting?: boolean;
  error?: string | null;
  result?: RuntimeTransactionDeleteResponse | null;
  onRequestDelete: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  deleteAvailable?: boolean;
}

export const TransactionDangerZone: React.FC<TransactionDangerZoneProps> = ({
  transaction,
  theme,
  confirmOpen,
  deleting = false,
  error = null,
  result = null,
  onRequestDelete,
  onCancel,
  onConfirm,
  deleteAvailable = true,
}) => {
  const projected = transaction as TransactionProjection;
  const deleted = getLifecycle(projected) === "deleted";
  const revisionAvailable =
    Number.isInteger(transaction.revision) && Number(transaction.revision) >= 0;
  const cleanupEntries = Object.entries(result?.cleanup || {}).slice(0, 6);

  if (deleted) {
    return (
      <section
        aria-label="Transaction deletion record"
        className={cn(
          "rounded-md border p-3",
          theme === "dark"
            ? "border-zinc-700 bg-zinc-900/35"
            : "border-zinc-300 bg-zinc-50",
        )}
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider",
                theme === "dark" ? "text-zinc-300" : "text-zinc-700",
              )}
            >
              Deleted / audit tombstone retained
            </h3>
            <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
              This transaction cannot be restored. Its tombstone remains visible for
              audit, and external actions already performed by tools or services were
              not reversed.
            </p>
            {transaction.deleted_at ? (
              <p className="mt-2 text-[8px] text-zinc-600">
                Deleted {formatTimestamp(transaction.deleted_at)}
              </p>
            ) : null}
          </div>
        </div>
        {result ? (
          <div
            className={cn(
              "mt-3 rounded border px-2.5 py-2",
              theme === "dark"
                ? "border-zinc-800 bg-black/20"
                : "border-zinc-200 bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-wider text-zinc-600">
              <span>{result.outcome || (result.already_deleted ? "Already deleted" : "Deletion complete")}</span>
              {result.replayed ? <span>Idempotent replay</span> : null}
            </div>
            {cleanupEntries.length ? (
              <dl className="mt-2 space-y-1.5">
                {cleanupEntries.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 text-[8px]">
                    <dt className="truncate uppercase text-zinc-600">{humanize(key)}</dt>
                    <dd className={cn("min-w-0 break-words text-right", theme === "dark" ? "text-zinc-400" : "text-zinc-600")}>
                      {cleanupValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label="Danger Zone"
      className={cn(
        "rounded-md border p-3",
        theme === "dark"
          ? "border-rose-500/30 bg-rose-950/10"
          : "border-rose-200 bg-rose-50/45",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
            Danger Zone
          </h3>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
            Delete writes a permanent lifecycle tombstone and invalidates pending work
            owned by this transaction. Audit evidence is retained. Actions already
            performed in external tools or services are not rolled back.
          </p>
        </div>
      </div>

      {!revisionAvailable ? (
        <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[8px] leading-relaxed text-amber-500">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Revision is unavailable. Refresh transactions before deleting.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[8px] leading-relaxed text-rose-400">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className={cn("mt-3 rounded border p-2.5", theme === "dark" ? "border-rose-500/35 bg-black/20" : "border-rose-300 bg-white")}>
          <p className={cn("text-[9px] font-bold", theme === "dark" ? "text-zinc-200" : "text-zinc-800")}>
            Permanently delete this transaction?
          </p>
          <p className="mt-1 text-[8px] leading-relaxed text-zinc-500">
            This cannot be undone or restored. External effects will remain in place.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className={cn(
                "rounded border px-2 py-2 text-[8px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                theme === "dark"
                  ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-100",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting || !revisionAvailable || !deleteAvailable}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-rose-500 bg-rose-600 px-2 py-2 text-[8px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequestDelete}
          disabled={!revisionAvailable || !deleteAvailable || deleting}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded border border-rose-500/50 px-2 py-2 text-[8px] font-bold uppercase tracking-wider text-rose-500 transition-colors hover:border-rose-500 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
          Delete transaction
        </button>
      )}
    </section>
  );
};

const TaskTab: React.FC<{
  transaction: TransactionProjection;
  theme: Theme;
}> = ({ transaction, theme }) => {
  const task = transaction.task_state;
  const completed = task?.completed ?? [];
  const remaining = task?.remaining ?? [];
  const status = normalize(task?.completion_status) || "processing";
  const statusTone: StatusPresentation["tone"] =
    status === "completed"
      ? "emerald"
      : status === "awaiting_user"
        ? "amber"
        : "cyan";

  return (
    <div className="space-y-3">
      <section
        className={cn(
          "rounded-md border p-3",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25"
            : "border-zinc-200 bg-white",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-600">
            Goal
          </span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider",
              toneClasses(statusTone, theme),
            )}
          >
            {humanize(status)}
          </span>
        </div>
        <p
          className={cn(
            "text-[10px] font-semibold leading-relaxed",
            theme === "dark" ? "text-zinc-200" : "text-zinc-800",
          )}
        >
          {task?.goal?.trim() || "No task goal has been recorded."}
        </p>
      </section>

      <section
        className={cn(
          "rounded-md border p-2.5",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25"
            : "border-zinc-200 bg-white",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <h3
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider",
              theme === "dark" ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            Completed
          </h3>
          <span className="ml-auto text-[8px] text-zinc-600">{completed.length}</span>
        </div>
        {completed.length ? (
          <ol className="space-y-1.5">
            {completed.map((item, index) => (
              <li key={`${index}-${item}`} className="flex items-start gap-2 text-[9px] leading-relaxed">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/80" />
                <span className={theme === "dark" ? "text-zinc-300" : "text-zinc-700"}>
                  {item}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[9px] italic text-zinc-600">No completed steps yet.</p>
        )}
      </section>

      <section
        className={cn(
          "rounded-md border p-2.5",
          theme === "dark"
            ? "border-zinc-800 bg-zinc-900/25"
            : "border-zinc-200 bg-white",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <ListTodo className="h-3.5 w-3.5 text-cyan-500" />
          <h3
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider",
              theme === "dark" ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            Remaining
          </h3>
          <span className="ml-auto text-[8px] text-zinc-600">{remaining.length}</span>
        </div>
        {remaining.length ? (
          <ol className="space-y-1.5">
            {remaining.map((item, index) => (
              <li key={`${index}-${item}`} className="flex items-start gap-2 text-[9px] leading-relaxed">
                <Circle className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                <span className={theme === "dark" ? "text-zinc-300" : "text-zinc-700"}>
                  {item}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[9px] italic text-zinc-600">No remaining steps recorded.</p>
        )}
      </section>
    </div>
  );
};

const SceneTab: React.FC<{
  transaction: TransactionProjection;
  entries: SceneEntry[];
  theme: Theme;
}> = ({ transaction, entries, theme }) => {
  const matchingEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            String(entry.transaction_id || "") === transaction.transaction_id,
        )
        .sort((a, b) => a.seq - b.seq),
    [entries, transaction.transaction_id],
  );

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-2.5 py-2 text-[8px] leading-relaxed",
          theme === "dark"
            ? "border-blue-500/20 bg-blue-500/5 text-blue-300/80"
            : "border-blue-200 bg-blue-50 text-blue-700",
        )}
      >
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <p>
          Scene is a conversation-shared timeline. This view only filters the
          currently loaded Scene window by <span className="font-mono">transaction_id</span>; it is
          neither a complete nor a private transaction log.
        </p>
      </div>

      {matchingEntries.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-4 w-4" />}
          title="No linked Scene entries"
          detail="The loaded Scene window has no entries tagged with this transaction ID."
          theme={theme}
        />
      ) : (
        <ol className="relative space-y-0 pl-3">
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-3 left-[17px] top-3 w-px",
              theme === "dark" ? "bg-zinc-800" : "bg-zinc-200",
            )}
          />
          {matchingEntries.map((entry) => (
            <li key={entry.seq} className="relative flex gap-2.5 pb-3 last:pb-0">
              <span
                className={cn(
                  "relative z-10 mt-2 h-2.5 w-2.5 shrink-0 rounded-full border-2",
                  entry.actor === "user"
                    ? "border-violet-400 bg-violet-500"
                    : entry.actor === "assistant"
                      ? "border-cyan-400 bg-cyan-500"
                      : theme === "dark"
                        ? "border-zinc-600 bg-zinc-800"
                        : "border-zinc-400 bg-zinc-200",
                )}
              />
              <article
                className={cn(
                  "min-w-0 flex-1 rounded-md border p-2.5",
                  theme === "dark"
                    ? "border-zinc-800 bg-zinc-900/25"
                    : "border-zinc-200 bg-white",
                )}
              >
                <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                  {entry.actor === "user" ? (
                    <UserRound className="h-3 w-3 shrink-0 text-violet-500" />
                  ) : entry.actor === "assistant" ? (
                    <Bot className="h-3 w-3 shrink-0 text-cyan-500" />
                  ) : (
                    <Activity className="h-3 w-3 shrink-0 text-zinc-500" />
                  )}
                  <span
                    className={cn(
                      "truncate text-[8px] font-bold uppercase tracking-wider",
                      theme === "dark" ? "text-zinc-300" : "text-zinc-700",
                    )}
                  >
                    {humanize(entry.actor)} · {humanize(entry.entry_type)}
                  </span>
                  <span className="ml-auto shrink-0 text-[8px] text-zinc-600">
                    #{entry.seq} · {formatTimestamp(entry.occurred_at)}
                  </span>
                </div>
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words text-[9px] leading-relaxed",
                    theme === "dark" ? "text-zinc-300" : "text-zinc-700",
                  )}
                >
                  {entry.text}
                </p>
                {entry.tool_name || entry.delegate_id ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.tool_name ? (
                      <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[8px] text-cyan-500">
                        tool: {entry.tool_name}
                      </span>
                    ) : null}
                    {entry.delegate_id ? (
                      <span className="max-w-full truncate rounded bg-violet-500/10 px-1.5 py-0.5 text-[8px] text-violet-500">
                        delegate: {entry.delegate_id}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const LegacyWorkingMemory: React.FC<{
  workingMemory: WorkingMemoryState;
  runtimeProfile: string;
  theme: Theme;
}> = ({ workingMemory, runtimeProfile, theme }) => {
  const [rawOpen, setRawOpen] = useState(false);
  const entries = workingMemory.entries ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "border-b px-3 py-2.5",
          theme === "dark" ? "border-zinc-800" : "border-zinc-200",
        )}
      >
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-cyan-500" />
          <div className="min-w-0 flex-1">
            <h2
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.12em]",
                theme === "dark" ? "text-zinc-200" : "text-zinc-800",
              )}
            >
              Thread WM · Legacy
            </h2>
            <p className="mt-0.5 truncate text-[8px] text-zinc-600">
              {runtimeProfile || "legacy"} · thread-scoped memory
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase",
              workingMemory.enabled === false
                ? toneClasses("zinc", theme)
                : toneClasses("emerald", theme),
            )}
          >
            {workingMemory.enabled === false ? "Off" : "Enabled"}
          </span>
        </div>
        <div
          className={cn(
            "mt-2 flex items-start gap-2 rounded border px-2 py-1.5 text-[8px] leading-relaxed",
            theme === "dark"
              ? "border-zinc-800 bg-zinc-900/40 text-zinc-500"
              : "border-zinc-200 bg-zinc-50 text-zinc-600",
          )}
        >
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          This runtime does not expose transaction ownership. WM is shown at
          thread scope for compatibility.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <WorkingMemoryEntries
          entries={entries}
          theme={theme}
          rawOpen={rawOpen}
          onToggleRaw={() => setRawOpen((value) => !value)}
        />
      </div>
    </div>
  );
};

export const TransactionCenter: React.FC<TransactionCenterProps> = ({
  transactions,
  activeTransactionId,
  cpuTransactionId,
  sceneEntries = [],
  runtimeProfile = "langgraph_v1",
  theme,
  loading = false,
  error = null,
  lastUpdated = null,
  onRefresh,
  onDeleteTransaction,
  resetToken,
  legacyWorkingMemory = null,
  className,
}) => {
  const projected = transactions as TransactionProjection[];
  const sorted = useMemo(
    () =>
      [...projected].sort((a, b) => {
        const rankDelta =
          transactionSortRank(a, activeTransactionId, cpuTransactionId) -
          transactionSortRank(b, activeTransactionId, cpuTransactionId);
        if (rankDelta !== 0) return rankDelta;
        return String(b.updated_at || "").localeCompare(
          String(a.updated_at || ""),
        );
      }),
    [activeTransactionId, cpuTransactionId, transactions],
  );
  const [filter, setFilter] = useState<TransactionFilter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [followCpu, setFollowCpu] = useState(true);
  const [rawWmOpen, setRawWmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] =
    useState<RuntimeTransactionDeleteResponse | null>(null);
  const previousResetTokenRef = useRef(resetToken);

  // `null` is an explicit idle/no-active signal; only `undefined` means that
  // an older caller omitted the aggregate IDs and per-row flags must be used.
  const resolvedCpuId =
    cpuTransactionId !== undefined
      ? cpuTransactionId
      : sorted.find((transaction) => transaction.is_cpu_holder)?.transaction_id ||
        null;
  const resolvedActiveUserId =
    activeTransactionId !== undefined
      ? activeTransactionId
      : sorted.find((transaction) => transaction.is_active_user)?.transaction_id ||
        null;

  useEffect(() => {
    const selectedExists = sorted.some(
      (transaction) => transaction.transaction_id === selectedId,
    );
    if (
      followCpu &&
      resolvedCpuId &&
      sorted.some((transaction) => transaction.transaction_id === resolvedCpuId)
    ) {
      setSelectedId(resolvedCpuId);
      return;
    }
    if (selectedExists) return;
    setSelectedId(
      resolvedCpuId || resolvedActiveUserId || sorted[0]?.transaction_id || null,
    );
    if (detailOpen && sorted.length === 0) setDetailOpen(false);
  }, [
    detailOpen,
    followCpu,
    resolvedActiveUserId,
    resolvedCpuId,
    selectedId,
    sorted,
  ]);

  useEffect(() => {
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setDeleteResult(null);
  }, [selectedId]);

  useEffect(() => {
    if (previousResetTokenRef.current === resetToken) return;
    previousResetTokenRef.current = resetToken;
    setSelectedId(null);
    setDetailOpen(false);
    setDetailTab("overview");
    setRawWmOpen(false);
    setDeleteConfirmOpen(false);
    setDeletingId(null);
    setDeleteError(null);
    setDeleteResult(null);
  }, [resetToken]);

  const counts = useMemo(
    () => ({
      open: sorted.filter((transaction) => matchesFilter(transaction, "open"))
        .length,
      paused: sorted.filter((transaction) =>
        matchesFilter(transaction, "paused"),
      ).length,
      closed: sorted.filter((transaction) =>
        matchesFilter(transaction, "closed"),
      ).length,
      all: sorted.length,
    }),
    [sorted],
  );
  const filtered = useMemo(
    () => sorted.filter((transaction) => matchesFilter(transaction, filter)),
    [filter, sorted],
  );
  const selected =
    sorted.find((transaction) => transaction.transaction_id === selectedId) ??
    null;
  const showLegacy =
    !isProductRuntimeProfile(runtimeProfile) && sorted.length === 0;

  const openTransaction = (transaction: TransactionProjection) => {
    setSelectedId(transaction.transaction_id);
    setDetailOpen(true);
    setDetailTab("overview");
    setRawWmOpen(false);
    // Entering a detail manually pins the user's selection, even when the card
    // happens to own CPU right now. A later CPU handoff must not jump the view.
    setFollowCpu(false);
  };

  const confirmDelete = async () => {
    if (!selected || !onDeleteTransaction || deletingId) return;
    setDeletingId(selected.transaction_id);
    setDeleteError(null);
    try {
      const result = await onDeleteTransaction(selected);
      setDeleteResult(result || null);
      setDeleteConfirmOpen(false);
      setFilter("closed");
    } catch (err: any) {
      setDeleteError(String(err?.message || "Failed to delete transaction"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      aria-label="Transaction Center"
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden font-mono text-[10px]",
        theme === "dark"
          ? "bg-[#0a0a0a] text-zinc-300"
          : "bg-white text-zinc-700",
        className,
      )}
    >
      {!showLegacy ? (
        <header
          className={cn(
            "shrink-0 border-b px-3 py-2.5",
            theme === "dark" ? "border-zinc-800" : "border-zinc-200",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                theme === "dark"
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                  : "border-cyan-200 bg-cyan-50 text-cyan-600",
              )}
            >
              <Activity className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                className={cn(
                  "truncate text-[10px] font-bold uppercase tracking-[0.12em]",
                  theme === "dark" ? "text-zinc-200" : "text-zinc-800",
                )}
              >
                Transaction Center
              </h2>
              <p className="mt-0.5 truncate text-[8px] text-zinc-600">
                {counts.open} open · {counts.paused} paused · {counts.closed} closed
              </p>
            </div>
            {onRefresh ? (
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={loading}
                title="Refresh transactions"
                aria-label="Refresh transactions"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50",
                  theme === "dark"
                    ? "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-cyan-400"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-cyan-600",
                )}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {showLegacy ? (
        <LegacyWorkingMemory
          workingMemory={legacyWorkingMemory ?? { enabled: false, entries: [] }}
          runtimeProfile={runtimeProfile}
          theme={theme}
        />
      ) : detailOpen && selected ? (
        <>
          <div
            className={cn(
              "shrink-0 border-b px-3 py-2.5",
              theme === "dark" ? "border-zinc-800" : "border-zinc-200",
            )}
          >
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              disabled={Boolean(deletingId)}
              className="mb-2 inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-3 w-3" />
              All transactions
            </button>
            <div className="flex min-w-0 items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className={cn(
                    "line-clamp-2 text-[11px] font-semibold leading-relaxed",
                    theme === "dark" ? "text-zinc-100" : "text-zinc-900",
                  )}
                  title={transactionGoal(selected)}
                >
                  {transactionGoal(selected)}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <StateBadge
                    transaction={selected}
                    isCpuHolder={selected.transaction_id === resolvedCpuId}
                    theme={theme}
                  />
                  {selected.transaction_id === resolvedCpuId ? (
                    <Marker type="cpu" theme={theme} />
                  ) : null}
                  {selected.transaction_id === resolvedActiveUserId ? (
                    <Marker type="user" theme={theme} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Transaction details"
            className={cn(
              "grid shrink-0 grid-cols-4 border-b px-2",
              theme === "dark" ? "border-zinc-800" : "border-zinc-200",
            )}
          >
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.id}
                onClick={() => setDetailTab(tab.id)}
                disabled={Boolean(deletingId)}
                className={cn(
                  "relative px-1 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  detailTab === tab.id
                    ? theme === "dark"
                      ? "text-cyan-300 after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-cyan-400"
                      : "text-cyan-700 after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-cyan-600"
                    : "text-zinc-600 hover:text-zinc-400",
                )}
              >
                {tab.label}
                {tab.id === "wm"
                  ? ` ${selected.wm_entries?.length ?? selected.wm_entry_count ?? 0}`
                  : ""}
                {tab.id === "scene"
                  ? ` ${
                      sceneEntries.filter(
                        (entry) =>
                          String(entry.transaction_id || "") ===
                          selected.transaction_id,
                      ).length
                    }`
                  : ""}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {detailTab === "overview" ? (
              <div className="space-y-3">
                <OverviewTab
                  transaction={selected}
                  isCpuHolder={selected.transaction_id === resolvedCpuId}
                  isActiveUser={selected.transaction_id === resolvedActiveUserId}
                  theme={theme}
                />
                <TransactionDangerZone
                  transaction={selected}
                  theme={theme}
                  confirmOpen={deleteConfirmOpen}
                  deleting={deletingId === selected.transaction_id}
                  error={deleteError}
                  result={deleteResult}
                  deleteAvailable={Boolean(onDeleteTransaction)}
                  onRequestDelete={() => {
                    setDeleteError(null);
                    setDeleteConfirmOpen(true);
                  }}
                  onCancel={() => {
                    if (deletingId) return;
                    setDeleteConfirmOpen(false);
                    setDeleteError(null);
                  }}
                  onConfirm={() => void confirmDelete()}
                />
              </div>
            ) : detailTab === "task" ? (
              <TaskTab transaction={selected} theme={theme} />
            ) : detailTab === "wm" ? (
              <WorkingMemoryEntries
                entries={selected.wm_entries ?? []}
                theme={theme}
                rawOpen={rawWmOpen}
                onToggleRaw={() => setRawWmOpen((value) => !value)}
              />
            ) : (
              <SceneTab
                transaction={selected}
                entries={sceneEntries}
                theme={theme}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div
            className={cn(
              "shrink-0 border-b px-3 py-2.5",
              theme === "dark" ? "border-zinc-800" : "border-zinc-200",
            )}
          >
            <div
              className={cn(
                "grid grid-cols-4 rounded-md border p-0.5",
                theme === "dark"
                  ? "border-zinc-800 bg-black/25"
                  : "border-zinc-200 bg-zinc-100",
              )}
            >
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "rounded px-1 py-1.5 text-[8px] font-bold uppercase tracking-wide transition-colors",
                    filter === item.id
                      ? theme === "dark"
                        ? "bg-zinc-800 text-cyan-300 shadow-sm"
                        : "bg-white text-cyan-700 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-400",
                  )}
                >
                  {item.label}
                  <span className="ml-1 opacity-60">{counts[item.id]}</span>
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={followCpu}
                onClick={() => {
                  setFollowCpu((value) => !value);
                  if (!followCpu && resolvedCpuId) setSelectedId(resolvedCpuId);
                }}
                className="group flex min-w-0 items-center gap-2 text-left"
                title="Automatically select the transaction that owns the runtime CPU"
              >
                <span
                  className={cn(
                    "relative h-3.5 w-6 shrink-0 rounded-full border transition-colors",
                    followCpu
                      ? theme === "dark"
                        ? "border-cyan-500/60 bg-cyan-500/25"
                        : "border-cyan-500 bg-cyan-100"
                      : theme === "dark"
                        ? "border-zinc-700 bg-zinc-900"
                        : "border-zinc-300 bg-zinc-100",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-2 w-2 rounded-full transition-all",
                      followCpu
                        ? "left-3 bg-cyan-400"
                        : "left-0.5 bg-zinc-500",
                    )}
                  />
                </span>
                <Cpu
                  className={cn(
                    "h-3 w-3 shrink-0",
                    followCpu ? "text-cyan-500" : "text-zinc-600",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-[8px] font-bold uppercase tracking-wider",
                    followCpu ? "text-cyan-500" : "text-zinc-600",
                  )}
                >
                  Follow CPU
                </span>
              </button>
              <span className="ml-auto truncate text-[8px] text-zinc-600">
                {resolvedCpuId ? "CPU assigned" : "CPU idle"}
              </span>
            </div>
          </div>

          {error ? (
            <div
              className={cn(
                "mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-md border px-2.5 py-2 text-[9px] leading-relaxed",
                theme === "dark"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-rose-200 bg-rose-50 text-rose-700",
              )}
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && sorted.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-zinc-600">
                <LoaderCircle className="h-4 w-4 animate-spin text-cyan-500" />
                <span className="text-[8px] uppercase tracking-wider">
                  Loading transactions
                </span>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={
                  sorted.length === 0
                    ? "No transactions yet"
                    : `No ${filter} transactions`
                }
                detail={
                  sorted.length === 0
                    ? "Transactions will appear here after the product runtime accepts work."
                    : "Choose another status filter to inspect the remaining transactions."
                }
                theme={theme}
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((transaction) => (
                  <TransactionCard
                    key={transaction.transaction_id}
                    transaction={transaction}
                    isCpuHolder={transaction.transaction_id === resolvedCpuId}
                    isActiveUser={
                      transaction.transaction_id === resolvedActiveUserId
                    }
                    selected={transaction.transaction_id === selectedId}
                    theme={theme}
                    onClick={() => openTransaction(transaction)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <footer
        className={cn(
          "flex shrink-0 items-center gap-1.5 border-t px-3 py-2 text-[8px] text-zinc-600",
          theme === "dark"
            ? "border-zinc-800 bg-black/20"
            : "border-zinc-200 bg-zinc-50",
        )}
      >
        <Clock3 className="h-3 w-3 shrink-0" />
        <span className="truncate">{formatUpdated(lastUpdated)}</span>
        <span className="ml-auto shrink-0 uppercase tracking-wider">
          {runtimeProfile || "unknown runtime"}
        </span>
      </footer>
    </section>
  );
};
