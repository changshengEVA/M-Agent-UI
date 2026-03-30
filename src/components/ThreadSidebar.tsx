import React from "react";
import { motion } from "motion/react";
import { MessageSquare, History, Clock, Database, Trash2, Plus, ArrowRight } from "lucide-react";
import { ThreadState, HistoryRound } from "../types/chat";
import { cn } from "../lib/utils";
import { formatDistanceToNow } from "date-fns";

import { BufferVial } from "./BufferVial";

interface ThreadSidebarProps {
  threadState: ThreadState | null;
  onNewThread: () => void;
  onSelectRound: (round: HistoryRound) => void;
  isFlushing: boolean;
  flushStatus: string | null;
  theme: "dark" | "light";
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({ 
  threadState, 
  onNewThread,
  onSelectRound,
  isFlushing,
  flushStatus,
  theme
}) => {
  return (
    <div className={cn(
      "flex flex-col h-full border-r font-mono text-[11px] backdrop-blur-none transition-colors duration-300 w-64",
      theme === 'dark' ? "bg-[#0A0A0A]/95 border-[#1A1A1A]" : "bg-white border-zinc-200"
    )}>
      <div className={cn(
        "p-4 border-b transition-colors",
        theme === 'dark' ? "border-[#1A1A1A]" : "border-zinc-200"
      )}>
        <button 
          onClick={onNewThread}
          disabled={isFlushing || (threadState?.pending_rounds || 0) > 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-sm font-bold uppercase tracking-widest transition-all group",
            (isFlushing || (threadState?.pending_rounds || 0) > 0)
              ? "bg-zinc-500/10 border-zinc-500/20 text-zinc-500 cursor-not-allowed opacity-50"
              : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
          )}
          title={(isFlushing || (threadState?.pending_rounds || 0) > 0) ? "Please wait until the buffer is flushed before starting a new thread" : "Start a new conversation"}
        >
          <Plus className={cn(
            "w-4 h-4 transition-transform",
            !(isFlushing || (threadState?.pending_rounds || 0) > 0) && "group-hover:rotate-90"
          )} />
          New Thread
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
        {/* Thread Stats */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
            <Database className="w-3 h-3" />
            Session Metrics
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={cn(
              "p-2 border rounded-sm text-center transition-colors",
              theme === 'dark' ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-200"
            )}>
              <div className="text-zinc-600 uppercase text-[8px]">Rounds</div>
              <div className={cn(
                "font-bold transition-colors",
                theme === 'dark' ? "text-zinc-200" : "text-zinc-900"
              )}>{threadState?.history_rounds || 0}</div>
            </div>
            <div className={cn(
              "p-2 border rounded-sm text-center transition-colors",
              theme === 'dark' ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-200"
            )}>
              <div className="text-zinc-600 uppercase text-[8px]">Pending</div>
              <div className={cn(
                "font-bold transition-colors",
                theme === 'dark' ? "text-zinc-200" : "text-zinc-900"
              )}>{threadState?.pending_rounds || 0}</div>
            </div>
          </div>
        </div>

        {/* History Rounds */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-500 uppercase font-bold tracking-tighter text-[9px]">
            <History className="w-3 h-3" />
            Recent History
          </div>
          <div className="space-y-2">
            {threadState?.history_preview?.length === 0 ? (
              <div className="text-zinc-700 italic text-center py-4">No history found</div>
            ) : (
              threadState?.history_preview?.map((round) => (
                <motion.button
                  key={round.round_id}
                  whileHover={{ x: 4 }}
                  onClick={() => onSelectRound(round)}
                  className={cn(
                    "w-full text-left p-2 rounded-sm border transition-all group",
                    theme === 'dark' 
                      ? "bg-zinc-900/30 border-zinc-800/50 hover:border-cyan-900/50 hover:bg-cyan-950/10" 
                      : "bg-zinc-50 border-zinc-200 hover:border-cyan-500/50 hover:bg-cyan-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-[8px] px-1 rounded-sm uppercase font-bold",
                      round.capture_state === "pending" ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
                    )}>
                      {round.capture_state}
                    </span>
                    <span className="text-[8px] text-zinc-600">
                      {new Date(round.user_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className={cn(
                    "line-clamp-1 transition-colors",
                    theme === 'dark' ? "text-zinc-400 group-hover:text-zinc-200" : "text-zinc-600 group-hover:text-zinc-900"
                  )}>{round.user_message}</p>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Buffer Vial Visualization */}
        <div className="pt-4 border-t border-zinc-900">
          <BufferVial 
            pendingCount={threadState?.pending_rounds || 0} 
            isFlushing={isFlushing}
            flushStatus={flushStatus}
            theme={theme}
          />
        </div>
      </div>

      <div className={cn(
        "p-4 border-t transition-colors",
        theme === 'dark' ? "border-[#1A1A1A] bg-[#050505]" : "border-zinc-200 bg-zinc-50"
      )}>
        <div className="flex items-center justify-between text-[9px] text-zinc-600 uppercase">
          <span>Last Activity</span>
          <span>
            {threadState?.last_activity_at 
              ? formatDistanceToNow(new Date(threadState.last_activity_at)) + " ago"
              : "Never"}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(threadState?.history_rounds || 0) / (threadState?.idle_flush_seconds || 600) * 100}%` }}
            className="h-full bg-cyan-500/50"
          />
        </div>
      </div>
    </div>
  );
};
