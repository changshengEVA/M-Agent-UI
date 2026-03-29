import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Database, Trash2, RefreshCw, Settings2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Message, ThreadState } from "../types/chat";
import { cn } from "../lib/utils";
import ReactMarkdown from "react-markdown";

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isThinking: boolean;
  threadState: ThreadState | null;
  onFlush: () => void;
  onToggleMode: () => void;
  isBackendOnline: boolean | null;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  isThinking,
  threadState,
  onFlush,
  onToggleMode,
  isBackendOnline
}) => {
  const [input, setInput] = useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isThinking) {
      onSendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-full flex-1 bg-[#050505]/95 relative overflow-hidden backdrop-blur-none">
      {/* Grid Background Effect */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

      {/* Header / Status Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-widest text-zinc-100 uppercase">M-Agent Terminal</h1>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                Thread: {threadState?.thread_id || "initializing..."}
              </span>
              <span className="opacity-20">|</span>
              <button 
                onClick={onToggleMode}
                className={cn(
                  "flex items-center gap-1 transition-colors hover:text-cyan-400",
                  threadState?.mode === "manual" ? "text-emerald-400" : "text-zinc-500"
                )}
              >
                {threadState?.mode === "manual" ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                Memory: {threadState?.mode?.toUpperCase() || "OFF"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {threadState?.has_pending_data && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onFlush}
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono hover:bg-amber-500/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              FLUSH BUFFER ({threadState.pending_rounds})
            </motion.button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-mono">
            <Settings2 className="w-3 h-3" />
            CONFIG: TEST_AGENT
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-none relative z-0"
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 && !isThinking && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 font-mono">
              <div className="w-16 h-16 border border-zinc-800 rounded-full flex items-center justify-center mb-4 opacity-20">
                <Bot className="w-8 h-8" />
              </div>
              <p className="text-sm tracking-widest uppercase opacity-30">System Ready. Awaiting Input.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-4 max-w-4xl mx-auto",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 border",
                msg.role === "user" ? "bg-zinc-900 border-zinc-700 text-zinc-400" : "bg-cyan-950/30 border-cyan-900 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
              )}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <div className={cn(
                "flex flex-col space-y-1",
                msg.role === "user" ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-sm text-sm leading-relaxed font-sans",
                  msg.role === "user" 
                    ? "bg-zinc-900/80 text-zinc-200 border border-zinc-800" 
                    : "bg-[#0A0A0A] text-zinc-100 border border-[#1A1A1A] shadow-sm"
                )}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter">
                  {msg.role} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))}

          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 max-w-4xl mx-auto"
            >
              <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 bg-cyan-950/30 border border-cyan-900 text-cyan-400 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex flex-col space-y-1">
                <div className="px-4 py-3 rounded-sm bg-[#0A0A0A] border border-[#1A1A1A] flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                  <span className="text-xs font-mono text-cyan-500/70 animate-pulse uppercase tracking-widest">Processing Neural Pathways...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-md z-10">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ENTER COMMAND OR MESSAGE..."
            disabled={isThinking}
            className="w-full bg-[#050505] border border-[#1A1A1A] rounded-sm py-3 pl-4 pr-12 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-cyan-900/50 focus:ring-1 focus:ring-cyan-900/20 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-cyan-400 disabled:opacity-30 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="max-w-4xl mx-auto mt-2 flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full animate-pulse",
              isBackendOnline === true ? "bg-emerald-500 shadow-[0_0_5px_#10b981]" : 
              isBackendOnline === false ? "bg-rose-500 shadow-[0_0_5px_#f43f5e]" : "bg-zinc-500"
            )} />
            <span>Uplink: {isBackendOnline === true ? "Stable" : isBackendOnline === false ? "Offline" : "Connecting..."}</span>
          </div>
          <span>Latency: 114ms</span>
        </div>
      </div>
    </div>
  );
};
