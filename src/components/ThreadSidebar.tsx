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
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({ 
  threadState, 
  onNewThread,
  onSelectRound
}) => {
  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]/95 border-r border-[#1A1A1A] w-64 font-mono text-[11px] backdrop-blur-none">
      <div className="p-4 border-b border-[#1A1A1A]">
        <button 
          onClick={onNewThread}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-sm bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all group"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
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
            <div className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-sm text-center">
              <div className="text-zinc-600 uppercase text-[8px]">Rounds</div>
              <div className="text-zinc-200 font-bold">{threadState?.history_rounds || 0}</div>
            </div>
            <div className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-sm text-center">
              <div className="text-zinc-600 uppercase text-[8px]">Pending</div>
              <div className="text-zinc-200 font-bold">{threadState?.pending_rounds || 0}</div>
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
                  className="w-full text-left p-2 rounded-sm bg-zinc-900/30 border border-zinc-800/50 hover:border-cyan-900/50 hover:bg-cyan-950/10 transition-all group"
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
                  <p className="text-zinc-400 line-clamp-1 group-hover:text-zinc-200 transition-colors">{round.user_message}</p>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Buffer Vial Visualization */}
        <div className="pt-4 border-t border-zinc-900">
          <BufferVial pendingCount={threadState?.pending_rounds || 0} />
        </div>
      </div>

      <div className="p-4 border-t border-[#1A1A1A] bg-[#050505] space-y-2">
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
