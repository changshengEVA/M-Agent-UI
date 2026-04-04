import React from "react";
import { motion } from "motion/react";
import { Database, History, MessageSquare, Plus, Archive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BufferVial } from "./BufferVial";
import { cn } from "../lib/utils";
import { DialogueDetail, DialogueSummary, HistoryRound, ThreadState } from "../types/chat";

interface ThreadSidebarProps {
  threadState: ThreadState | null;
  onNewThread: () => void;
  onSelectRound: (round: HistoryRound) => void;
  dialogues: DialogueSummary[];
  dialoguesLoading: boolean;
  dialoguesError: string | null;
  selectedDialogue: DialogueDetail | null;
  selectedDialogueId: string | null;
  onSelectDialogue: (dialogue: DialogueSummary) => void;
  isFlushing: boolean;
  flushStatus: string | null;
  theme: "dark" | "light";
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threadState,
  onNewThread,
  onSelectRound,
  dialogues,
  dialoguesLoading,
  dialoguesError,
  selectedDialogue,
  selectedDialogueId,
  onSelectDialogue,
  isFlushing,
  flushStatus,
  theme,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col h-full border-r font-mono text-[11px] backdrop-blur-none transition-colors duration-300 w-72",
        theme === "dark" ? "bg-[#0A0A0A]/95 border-[#1A1A1A]" : "bg-white border-zinc-200",
      )}
    >
      <div
        className={cn(
          "p-4 border-b transition-colors",
          theme === "dark" ? "border-[#1A1A1A]" : "border-zinc-200",
        )}
      >
        <button
          onClick={onNewThread}
          disabled={isFlushing || (threadState?.pending_rounds || 0) > 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-sm font-bold uppercase tracking-widest transition-all group",
            isFlushing || (threadState?.pending_rounds || 0) > 0
              ? "bg-zinc-500/10 border-zinc-500/20 text-zinc-500 cursor-not-allowed opacity-50"
              : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20",
          )}
          title={
            isFlushing || (threadState?.pending_rounds || 0) > 0
              ? "Please wait until buffer flush completes before starting a new thread"
              : "Start a new conversation"
          }
        >
          <Plus
            className={cn(
              "w-4 h-4 transition-transform",
              !(isFlushing || (threadState?.pending_rounds || 0) > 0) && "group-hover:rotate-90",
            )}
          />
          New Thread
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
        <div className="pt-1">
          <BufferVial
            pendingCount={threadState?.pending_rounds || 0}
            isFlushing={isFlushing}
            flushStatus={flushStatus}
            theme={theme}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
            <Database className="w-3 h-3" />
            Session Metrics
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className={cn(
                "p-2 border rounded-sm text-center transition-colors",
                theme === "dark" ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-200",
              )}
            >
              <div className="text-zinc-600 uppercase text-[8px]">Rounds</div>
              <div className={cn("font-bold transition-colors", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                {threadState?.history_rounds || 0}
              </div>
            </div>
            <div
              className={cn(
                "p-2 border rounded-sm text-center transition-colors",
                theme === "dark" ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-200",
              )}
            >
              <div className="text-zinc-600 uppercase text-[8px]">Pending</div>
              <div className={cn("font-bold transition-colors", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                {threadState?.pending_rounds || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
            <History className="w-3 h-3" />
            Recent Thread Rounds
          </div>
          <div className="space-y-2">
            {threadState?.history_preview?.length === 0 ? (
              <div className="text-zinc-700 italic text-center py-3">No live thread history</div>
            ) : (
              threadState?.history_preview?.map((round) => (
                <motion.button
                  key={round.round_id}
                  whileHover={{ x: 4 }}
                  onClick={() => onSelectRound(round)}
                  className={cn(
                    "w-full text-left p-2 rounded-sm border transition-all group",
                    theme === "dark"
                      ? "bg-zinc-900/30 border-zinc-800/50 hover:border-cyan-900/50 hover:bg-cyan-950/10"
                      : "bg-zinc-50 border-zinc-200 hover:border-cyan-500/50 hover:bg-cyan-50",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-[8px] px-1 rounded-sm uppercase font-bold",
                        round.capture_state === "pending"
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-emerald-500/20 text-emerald-500",
                      )}
                    >
                      {round.capture_state}
                    </span>
                    <span className="text-[8px] text-zinc-600">
                      {new Date(round.user_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "line-clamp-1 transition-colors",
                      theme === "dark" ? "text-zinc-400 group-hover:text-zinc-200" : "text-zinc-600 group-hover:text-zinc-900",
                    )}
                  >
                    {round.user_message}
                  </p>
                </motion.button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
            <Archive className="w-3 h-3" />
            Stored Dialogues
          </div>
          {dialoguesLoading ? (
            <div className="text-zinc-500 text-[10px]">Loading dialogue history...</div>
          ) : dialoguesError ? (
            <div className="text-rose-500 text-[10px]">{dialoguesError}</div>
          ) : dialogues.length <= 0 ? (
            <div className="text-zinc-700 italic text-center py-3">No stored dialogues yet</div>
          ) : (
            <div className="space-y-2">
              {dialogues.slice(0, 20).map((item) => (
                <button
                  key={item.dialogue_id}
                  onClick={() => onSelectDialogue(item)}
                  className={cn(
                    "w-full text-left p-2 rounded-sm border transition-all",
                    selectedDialogueId === item.dialogue_id
                      ? "border-cyan-500/60 bg-cyan-500/10"
                      : theme === "dark"
                        ? "border-zinc-800/60 bg-zinc-900/20 hover:border-cyan-900/60"
                        : "border-zinc-200 bg-zinc-50 hover:border-cyan-300",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-cyan-500">{item.thread_id || "unknown-thread"}</span>
                    <span className="text-[9px] text-zinc-500">{item.start_time ? new Date(item.start_time).toLocaleDateString() : "-"}</span>
                  </div>
                  <p className={cn("line-clamp-1 mt-1", theme === "dark" ? "text-zinc-300" : "text-zinc-700")}>
                    {item.preview || item.dialogue_id}
                  </p>
                  <div className="text-[9px] text-zinc-500 mt-1">
                    rounds={item.round_count} turns={item.turn_count}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedDialogue && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
              <MessageSquare className="w-3 h-3" />
              Dialogue Preview
            </div>
            <div
              className={cn(
                "p-2 rounded-sm border space-y-2 max-h-56 overflow-y-auto",
                theme === "dark" ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50",
              )}
            >
              {selectedDialogue.turns.slice(0, 12).map((turn) => (
                <div key={`${selectedDialogue.dialogue_id}-${turn.turn_id}`} className="space-y-1">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                    {turn.speaker || "unknown"} {turn.timestamp ? `@ ${new Date(turn.timestamp).toLocaleTimeString()}` : ""}
                  </div>
                  <p className={cn("text-[11px] leading-relaxed", theme === "dark" ? "text-zinc-200" : "text-zinc-800")}>
                    {turn.text}
                  </p>
                </div>
              ))}
              {selectedDialogue.turns.length > 12 && (
                <p className="text-[10px] text-zinc-500">
                  ... {selectedDialogue.turns.length - 12} more turns
                </p>
              )}
            </div>
          </div>
        )}

      </div>

      <div
        className={cn(
          "p-4 border-t transition-colors",
          theme === "dark" ? "border-[#1A1A1A] bg-[#050505]" : "border-zinc-200 bg-zinc-50",
        )}
      >
        <div className="flex items-center justify-between text-[9px] text-zinc-600 uppercase">
          <span>Last Activity</span>
          <span>
            {threadState?.last_activity_at ? `${formatDistanceToNow(new Date(threadState.last_activity_at))} ago` : "Never"}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${((threadState?.history_rounds || 0) / (threadState?.idle_flush_seconds || 600)) * 100}%`,
            }}
            className="h-full bg-cyan-500/50"
          />
        </div>
      </div>
    </div>
  );
};
