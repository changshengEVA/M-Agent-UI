import React from "react";
import { motion } from "motion/react";
import { Database, History, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BufferVial } from "./BufferVial";
import { TransactionCenter } from "./TransactionCenter";
import { cn } from "../lib/utils";
import type {
  SceneEntry,
  ThinkLifeTransaction,
  ThinkLifeTransactionDeleteResponse,
  ThreadState,
} from "../types/chat";
import { isProductRuntimeProfile } from "../lib/thinkLifeRuntime";

interface ThreadSidebarProps {
  threadState: ThreadState | null;
  runtimeProfile?: string;
  bufferVialCount?: number;
  bufferVialMax?: number;
  onNewConversation: () => void;
  onOpenHistory: () => void;
  historyCount?: number;
  transactions: ThinkLifeTransaction[];
  activeTransactionId?: string | null;
  cpuTransactionId?: string | null;
  sceneEntries?: SceneEntry[];
  transactionsLoading?: boolean;
  transactionsError?: string | null;
  transactionsUpdatedAt?: string | null;
  onRefreshTransactions?: () => void | Promise<void>;
  onDeleteTransaction?: (
    transaction: ThinkLifeTransaction,
  ) => Promise<ThinkLifeTransactionDeleteResponse | void>;
  transactionResetToken?: string | number;
  isFlushing: boolean;
  flushStatus: string | null;
  theme: "dark" | "light";
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threadState,
  runtimeProfile = "legacy",
  bufferVialCount,
  bufferVialMax = 12,
  onNewConversation,
  onOpenHistory,
  historyCount = 0,
  transactions,
  activeTransactionId,
  cpuTransactionId,
  sceneEntries = [],
  transactionsLoading = false,
  transactionsError = null,
  transactionsUpdatedAt = null,
  onRefreshTransactions,
  onDeleteTransaction,
  transactionResetToken,
  isFlushing,
  flushStatus,
  theme,
}) => {
  const isThinkLife = isProductRuntimeProfile(runtimeProfile);
  const vialCount = bufferVialCount ?? threadState?.pending_rounds ?? 0;
  const blockNewConversation =
    isFlushing || threadState === null || Boolean(threadState.has_pending_data);

  return (
    <aside
      className={cn(
        "flex h-full w-[21rem] shrink-0 flex-col border-r font-mono text-[11px] backdrop-blur-none transition-colors duration-300 max-[1180px]:w-72",
        theme === "dark"
          ? "border-[#1A1A1A] bg-[#0A0A0A]/95"
          : "border-zinc-200 bg-white",
      )}
    >
      <div
        className={cn(
          "grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b p-3",
          theme === "dark" ? "border-[#1A1A1A]" : "border-zinc-200",
        )}
      >
        <button
          type="button"
          onClick={onNewConversation}
          disabled={blockNewConversation}
          className={cn(
            "group flex min-w-0 items-center justify-center gap-2 rounded-sm border px-3 py-2 font-bold uppercase tracking-widest transition-all",
            blockNewConversation
              ? "cursor-not-allowed border-zinc-500/20 bg-zinc-500/10 text-zinc-500 opacity-50"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
          )}
          title={
            blockNewConversation
              ? "Flush the current conversation before starting a new one"
              : "Start a new conversation"
          }
        >
          <Plus
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              !blockNewConversation && "group-hover:rotate-90",
            )}
          />
          <span className="truncate">New Conversation</span>
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          className={cn(
            "relative flex h-full min-w-12 items-center justify-center gap-1.5 rounded-sm border px-2 text-zinc-500 transition-colors",
            theme === "dark"
              ? "border-zinc-800 hover:border-cyan-900 hover:bg-cyan-950/20 hover:text-cyan-400"
              : "border-zinc-200 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-600",
          )}
          title="Open thread and stored dialogue history"
          aria-label={`Open history, ${historyCount} records`}
        >
          <History className="h-4 w-4" />
          {historyCount > 0 ? (
            <span className="min-w-4 rounded-full bg-cyan-500/15 px-1 text-center text-[8px] font-bold text-cyan-500">
              {historyCount > 99 ? "99+" : historyCount}
            </span>
          ) : null}
        </button>
      </div>

      <div
        className={cn(
          "shrink-0 space-y-3 border-b p-3",
          theme === "dark" ? "border-[#1A1A1A]" : "border-zinc-200",
        )}
      >
        <BufferVial
          pendingCount={vialCount}
          maxCount={bufferVialMax}
          isFlushing={isFlushing}
          flushStatus={flushStatus}
          theme={theme}
          headerLabel={isThinkLife ? "Segment" : "Buffer"}
          unitLabel={isThinkLife ? "Turns" : "Units"}
        />

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-zinc-500">
            <Database className="h-3 w-3" />
            Session Metrics
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Rounds", threadState?.history_rounds || 0],
              [isThinkLife ? "Segment" : "Pending", isThinkLife ? vialCount : threadState?.pending_rounds || 0],
              ["Queue", threadState?.think_life?.pending_stimuli || 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className={cn(
                  "rounded-sm border p-2 text-center transition-colors",
                  theme === "dark"
                    ? "border-zinc-800 bg-zinc-900/50"
                    : "border-zinc-200 bg-zinc-50",
                )}
              >
                <div className="truncate text-[7px] uppercase text-zinc-600">{label}</div>
                <div
                  className={cn(
                    "font-bold",
                    theme === "dark" ? "text-zinc-200" : "text-zinc-900",
                  )}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TransactionCenter
          transactions={transactions}
          activeTransactionId={activeTransactionId}
          cpuTransactionId={cpuTransactionId}
          sceneEntries={sceneEntries}
          runtimeProfile={runtimeProfile}
          theme={theme}
          loading={transactionsLoading}
          error={transactionsError}
          lastUpdated={transactionsUpdatedAt}
          onRefresh={onRefreshTransactions}
          onDeleteTransaction={onDeleteTransaction}
          resetToken={transactionResetToken}
          legacyWorkingMemory={threadState?.working_memory ?? null}
        />
      </div>

      <div
        className={cn(
          "shrink-0 border-t p-3",
          theme === "dark"
            ? "border-[#1A1A1A] bg-[#050505]"
            : "border-zinc-200 bg-zinc-50",
        )}
      >
        <div className="flex items-center justify-between text-[8px] uppercase text-zinc-600">
          <span>Last Activity</span>
          <span>
            {threadState?.last_activity_at
              ? `${formatDistanceToNow(new Date(threadState.last_activity_at))} ago`
              : "Never"}
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-900">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(
                100,
                ((threadState?.history_rounds || 0) /
                  (threadState?.idle_flush_seconds || 600)) *
                  100,
              )}%`,
            }}
            className="h-full bg-cyan-500/50"
          />
        </div>
      </div>
    </aside>
  );
};
