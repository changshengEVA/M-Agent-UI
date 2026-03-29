import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Terminal, Cpu, Search, Layers, Wrench, CheckCircle, AlertCircle, Play, Activity } from "lucide-react";
import { ThinkingLog } from "../types/chat";
import { cn } from "../lib/utils";

interface ThinkingPanelProps {
  logs: ThinkingLog[];
  isThinking: boolean;
}

const getIcon = (type: string) => {
  switch (type) {
    case "run_started": return <Play className="w-4 h-4" />;
    case "recall_started": return <Search className="w-4 h-4" />;
    case "question_strategy": return <Cpu className="w-4 h-4" />;
    case "plan_update": return <Layers className="w-4 h-4" />;
    case "tool_call": return <Wrench className="w-4 h-4" />;
    case "tool_result": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "run_completed": return <CheckCircle className="w-4 h-4 text-blue-400" />;
    case "run_failed": return <AlertCircle className="w-4 h-4 text-rose-400" />;
    default: return <Activity className="w-4 h-4" />;
  }
};

const getLogColor = (type: string) => {
  if (type.includes("failed") || type.includes("error")) return "text-rose-400 border-rose-900/30 bg-rose-900/10";
  if (type.includes("completed") || type.includes("success")) return "text-emerald-400 border-emerald-900/30 bg-emerald-900/10";
  if (type.includes("tool")) return "text-cyan-400 border-cyan-900/30 bg-cyan-900/10";
  if (type.includes("plan") || type.includes("strategy")) return "text-amber-400 border-amber-900/30 bg-amber-900/10";
  return "text-zinc-400 border-zinc-800 bg-zinc-900/50";
};

const LogItem = ({ log }: { log: ThinkingLog }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "p-2 border rounded-sm transition-colors",
        getLogColor(log.type)
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {getIcon(log.type)}
        <span className="font-bold uppercase opacity-80">{log.type.replace(/_/g, " ")}</span>
        <span className="ml-auto opacity-40 text-[9px]">
          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div className="pl-6 opacity-90 leading-relaxed break-words">
        {log.message}
      </div>
      {log.data && (
        <div className="mt-2 pl-6">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[8px] uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1 mb-1"
          >
            {isExpanded ? "[-] Hide Details" : "[+] View Details"}
          </button>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="overflow-hidden"
            >
              <pre className="text-[9px] opacity-40 bg-black/40 p-2 rounded border border-white/5 overflow-x-auto max-h-40 scrollbar-none">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export const ThinkingPanel: React.FC<ThinkingPanelProps> = ({ logs, isThinking }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-[#050505]/95 border-l border-[#1A1A1A] w-80 font-mono text-[11px] backdrop-blur-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A] bg-[#0A0A0A]/40">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-4 h-4" />
          <span className="uppercase tracking-widest font-bold">Process Monitor</span>
        </div>
        {isThinking && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]"
          />
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none"
      >
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-50 text-center px-4">
              <Activity className="w-8 h-8 mb-2 opacity-20" />
              <p>Waiting for system activity...</p>
            </div>
          ) : (
            logs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-[#1A1A1A] bg-[#0A0A0A] text-zinc-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
          <span>Kernel: Active</span>
        </div>
        <span className="opacity-40">v1.0.4-stable</span>
      </div>
    </div>
  );
};
