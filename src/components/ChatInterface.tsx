import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Database, RefreshCw, Settings2, ShieldCheck, ShieldAlert, Sun, Moon, LogOut, CalendarClock, ScrollText, ImagePlus, X, Square } from "lucide-react";
import { Message, ThreadState, ThinkLifeRuntimePhase } from "../types/chat";
import { cn } from "../lib/utils";
import { thinkLifePhaseLabel, isProductRuntimeProfile } from "../lib/thinkLifeRuntime";
import ReactMarkdown from "react-markdown";
import { chatApi } from "../services/api";

const AuthenticatedImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const safeSrc = String(src || "").trim();
    if (!safeSrc) {
      setResolvedSrc("");
      return () => {
        return;
      };
    }

    if (safeSrc.startsWith("blob:") || safeSrc.startsWith("data:")) {
      setResolvedSrc(safeSrc);
      return () => {
        return;
      };
    }

    const load = async () => {
      try {
        const response = await fetch(safeSrc, {
          headers: chatApi.getImageFetchHeaders(),
          mode: "cors",
        });
        if (!response.ok) {
          throw new Error(`image fetch failed: ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active && objectUrl) {
          setResolvedSrc(objectUrl);
        }
      } catch {
        if (active) {
          setResolvedSrc(safeSrc);
        }
      }
    };

    load();
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} className={className} />;
};

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isThinking: boolean;
  runtimeProfile?: string;
  thinkLifePhase?: ThinkLifeRuntimePhase;
  isFlushing: boolean;
  threadState: ThreadState | null;
  onFlush: () => void;
  onStopThinking?: () => void;
  isStoppingThinking?: boolean;
  onToggleMode: () => void;
  onToggleTheme: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onOpenSchedules: () => void;
  onOpenScene?: () => void;
  sceneEntryCount?: number;
  onLogout: () => void;
  theme: "dark" | "light";
  isBackendOnline: boolean | null;
  authLabel?: string;
  selectedImage?: {
    previewUrl: string;
    fileName: string;
    isUploading?: boolean;
    blipCaption?: string;
  } | null;
  onSelectImage?: (file: File | null) => void;
  onClearImage?: () => void;
  readOnlyDialogueId?: string | null;
  onExitReadOnly?: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  isThinking,
  runtimeProfile = "legacy",
  thinkLifePhase = "ready",
  isFlushing,
  threadState,
  onFlush,
  onStopThinking,
  isStoppingThinking = false,
  onToggleMode,
  onToggleTheme,
  onRetry,
  onOpenSettings,
  onOpenSchedules,
  onOpenScene,
  sceneEntryCount = 0,
  onLogout,
  theme,
  isBackendOnline,
  authLabel,
  selectedImage,
  onSelectImage,
  onClearImage,
  readOnlyDialogueId = null,
  onExitReadOnly,
}) => {
  const [input, setInput] = useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isThinkLife = isProductRuntimeProfile(runtimeProfile);
  const isReadOnly = Boolean(readOnlyDialogueId);
  const inputDisabled = isReadOnly || isFlushing || (!isThinkLife && isThinking);
  const canSend =
    (!!input.trim() || !!selectedImage) &&
    !inputDisabled;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSend) {
      onSendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-full flex-1 bg-transparent relative overflow-hidden backdrop-blur-none">
      {/* Grid Background Effect */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(${theme === 'dark' ? '#00FF00' : '#000000'} 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />

      {/* Header / Status Bar */}
      <div className={cn(
        "flex items-center justify-between px-6 py-4 border-b backdrop-blur-md z-10 transition-all duration-300",
        theme === 'dark' ? "bg-[#0A0A0A]/80 border-[#1A1A1A]" : "bg-white/80 border-zinc-200"
      )}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className={cn(
              "text-sm font-bold tracking-widest uppercase transition-colors",
              theme === 'dark' ? "text-zinc-100" : "text-zinc-900"
            )}>M-Agent Terminal</h1>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                Thread: {threadState?.thread_id || "initializing..."}
              </span>
              {authLabel && (
                <>
                  <span className="opacity-20">|</span>
                  <span>User: {authLabel}</span>
                </>
              )}
              <span className="opacity-20">|</span>
              <button 
                onClick={onToggleMode}
                className={cn(
                  "flex items-center gap-1 transition-colors hover:text-cyan-400",
                  threadState?.mode === "manual" ? "text-emerald-400" : "text-zinc-500"
                )}
              >
                {threadState?.mode === "manual" ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                Capture: {threadState?.mode?.toUpperCase() || "OFF"}
              </button>
              {isThinkLife && (
                <span
                  className={cn(
                    "text-[10px] font-mono uppercase tracking-wider",
                    thinkLifePhase === "busy"
                      ? "text-amber-400"
                      : thinkLifePhase === "processing"
                        ? "text-cyan-400"
                        : "text-emerald-500/80",
                  )}
                >
                  OS: {thinkLifePhaseLabel(thinkLifePhase)}
                  {typeof threadState?.think_life?.effective_depth === "number"
                    ? ` (depth=${threadState.think_life.effective_depth})`
                    : threadState?.think_life?.pending_stimuli
                      ? ` (inbox=${threadState.think_life.pending_stimuli})`
                      : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isThinking && onStopThinking && (
            <button
              type="button"
              onClick={onStopThinking}
              disabled={isStoppingThinking}
              className={cn(
                "p-1.5 rounded-sm border transition-colors",
                theme === 'dark'
                  ? "border-rose-900/60 text-rose-400 hover:bg-rose-950/30"
                  : "border-rose-200 text-rose-600 hover:bg-rose-50",
                isStoppingThinking && "opacity-50 cursor-not-allowed",
              )}
              title="Force stop thinking"
            >
              {isStoppingThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          {threadState?.has_pending_data && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onFlush}
              disabled={isFlushing}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono transition-colors",
                isFlushing ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-500/20"
              )}
              title={
                isThinkLife
                  ? "结束当前 user 事务段并写入长期记忆（与 Scene 段对齐）"
                  : "将待写入对话缓冲刷新到长期记忆"
              }
            >
              <RefreshCw className={cn("w-3 h-3", isFlushing && "animate-spin")} />
              {isFlushing
                ? "FLUSHING..."
                : isThinkLife
                  ? `FLUSH SEGMENT (${threadState?.scene_pending_turns ?? 0})`
                  : `FLUSH BUFFER (${threadState?.pending_rounds ?? 0})`}
            </motion.button>
          )}
          <button
            onClick={onOpenSchedules}
            className={cn(
              "p-1.5 rounded-sm border transition-colors",
              theme === 'dark' ? "border-zinc-800 text-zinc-400 hover:text-cyan-400" : "border-zinc-200 text-zinc-500 hover:text-cyan-600"
            )}
            title="Schedules"
          >
            <CalendarClock className="w-4 h-4" />
          </button>
          {onOpenScene && isThinkLife && (
            <button
              type="button"
              onClick={onOpenScene}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-sm border text-[10px] font-mono uppercase tracking-wider transition-colors",
                theme === "dark"
                  ? "border-cyan-800/60 text-cyan-400 hover:bg-cyan-950/30"
                  : "border-cyan-200 text-cyan-700 hover:bg-cyan-50",
              )}
              title="情景时间轴 (Scene)"
            >
              <ScrollText className="w-3.5 h-3.5" />
              Scene
              {sceneEntryCount > 0 ? (
                <span className="opacity-70">({sceneEntryCount})</span>
              ) : null}
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className={cn(
              "p-1.5 rounded-sm border transition-colors",
              theme === 'dark' ? "border-zinc-800 text-zinc-400 hover:text-cyan-400" : "border-zinc-200 text-zinc-500 hover:text-cyan-600"
            )}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleTheme}
            className={cn(
              "p-1.5 rounded-sm border transition-colors",
              theme === 'dark' ? "border-zinc-800 text-zinc-400 hover:text-cyan-400" : "border-zinc-200 text-zinc-500 hover:text-cyan-600"
            )}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={onLogout}
            className={cn(
              "p-1.5 rounded-sm border transition-colors",
              theme === 'dark' ? "border-zinc-800 text-zinc-400 hover:text-rose-400" : "border-zinc-200 text-zinc-500 hover:text-rose-600"
            )}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
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
                "w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 border transition-colors",
                msg.role === "user" 
                  ? (theme === 'dark' ? "bg-zinc-900 border-zinc-700 text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-500")
                  : "bg-cyan-950/30 border-cyan-900 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
              )}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <div className={cn(
                "flex flex-col space-y-1",
                msg.role === "user" ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-sm text-sm leading-relaxed font-sans transition-all duration-500 relative group",
                  msg.role === "user" 
                    ? (theme === 'dark' ? "bg-zinc-900/40 backdrop-blur-sm text-zinc-200 border border-zinc-800/50" : "bg-white/60 backdrop-blur-sm text-zinc-800 border border-zinc-200 shadow-sm")
                    : (theme === 'dark' 
                        ? "bg-cyan-500/[0.03] backdrop-blur-md text-zinc-100 border border-cyan-500/20 shadow-[inset_0_0_20px_rgba(6,182,212,0.01)] hover:border-cyan-500/40" 
                        : "bg-cyan-500/[0.05] backdrop-blur-md text-zinc-900 border border-cyan-200 shadow-sm hover:border-cyan-300")
                )}>
                  {/* Sci-fi corner accents for Agent */}
                  {msg.role === "assistant" && (
                    <>
                      <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-cyan-500/40 group-hover:border-cyan-500 transition-colors" />
                      <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-cyan-500/40 group-hover:border-cyan-500 transition-colors" />
                    </>
                  )}
                  
                  <div className={cn(
                    "prose prose-sm max-w-none transition-colors",
                    theme === 'dark' ? "prose-invert" : "prose-zinc"
                  )}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.attachments?.length ? (
                    <div className="mt-3 space-y-2">
                      {msg.attachments.map((attachment, index) => (
                        <div
                          key={`${msg.id}-att-${index}`}
                          className={cn(
                            "rounded-sm border p-2",
                            theme === "dark" ? "border-zinc-800/80 bg-black/20" : "border-zinc-200 bg-zinc-50/80",
                          )}
                        >
                          {attachment.image_url ? (
                            <AuthenticatedImage
                              src={attachment.image_url}
                              alt={attachment.blip_caption || "uploaded image"}
                              className="max-h-52 rounded-sm border border-black/10 object-contain"
                            />
                          ) : null}
                          {attachment.blip_caption ? (
                            <p className="mt-2 text-[11px] font-mono text-cyan-500">
                              BLIP: {attachment.blip_caption}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter px-1">
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
                <div className={cn(
                  "px-4 py-3 rounded-sm border flex items-center gap-3 transition-all backdrop-blur-md relative",
                  theme === 'dark' 
                    ? "bg-cyan-500/[0.02] border-cyan-500/20" 
                    : "bg-cyan-500/[0.05] border-cyan-200 shadow-sm"
                )}>
                  <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-cyan-500/40" />
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                  <span className="text-xs font-mono text-cyan-500/70 animate-pulse uppercase tracking-widest">
                    {isThinkLife
                      ? thinkLifePhase === "busy"
                        ? "Queue Backlog — Processing..."
                        : "Processing Neural Pathways..."
                      : "Processing Neural Pathways..."}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {isFlushing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 max-w-4xl mx-auto"
            >
              <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 bg-amber-950/30 border border-amber-900 text-amber-400 animate-pulse">
                <Database className="w-4 h-4" />
              </div>
              <div className="flex flex-col space-y-1">
                <div className={cn(
                  "px-4 py-3 rounded-sm border flex items-center gap-3 transition-colors",
                  theme === 'dark' ? "bg-[#0A0A0A] border-[#1A1A1A]" : "bg-white border-zinc-200 shadow-sm"
                )}>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-xs font-mono text-amber-500/70 animate-pulse uppercase tracking-widest">Consolidating Memory Buffer...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className={cn(
        "p-6 border-t z-10 transition-all duration-300",
        theme === 'dark' ? "bg-[#0A0A0A]/80 border-[#1A1A1A]" : "bg-white/80 border-zinc-200"
      )}>
        {isReadOnly ? (
          <div className="max-w-4xl mx-auto mb-3 flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            <span className="truncate">Stored dialogue: {readOnlyDialogueId}</span>
            {onExitReadOnly ? (
              <button
                type="button"
                onClick={onExitReadOnly}
                className="shrink-0 text-cyan-500 transition-colors hover:text-cyan-300"
              >
                Return to live conversation
              </button>
            ) : null}
          </div>
        ) : null}
        {selectedImage ? (
          <div className="max-w-4xl mx-auto mb-3">
            <div
              className={cn(
                "flex items-start gap-3 rounded-sm border p-3",
                theme === "dark" ? "border-zinc-800 bg-black/30" : "border-zinc-200 bg-zinc-50/90",
              )}
            >
              <img
                src={selectedImage.previewUrl}
                alt={selectedImage.fileName}
                className="h-20 w-20 rounded-sm object-cover border border-black/10"
              />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-xs font-mono", theme === "dark" ? "text-zinc-200" : "text-zinc-800")}>
                  {selectedImage.fileName}
                </p>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {selectedImage.isUploading ? "Analyzing image..." : "Ready to send"}
                </p>
                {selectedImage.blipCaption ? (
                  <p className="mt-2 text-[11px] font-mono text-cyan-500">
                    BLIP: {selectedImage.blipCaption}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onClearImage?.()}
                disabled={inputDisabled || selectedImage.isUploading}
                className="text-zinc-500 transition-colors hover:text-rose-500 disabled:opacity-40"
                title="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => onSelectImage?.(e.target.files?.[0] || null)}
            className="hidden"
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isReadOnly
                ? "STORED DIALOGUE — READ ONLY"
                : isFlushing
                  ? "MEMORY FLUSH IN PROGRESS..."
                  : "ENTER COMMAND OR MESSAGE..."
            }
            disabled={inputDisabled}
            className={cn(
              "w-full rounded-sm py-3 pl-4 pr-12 text-sm font-mono transition-all disabled:opacity-50 border focus:outline-none focus:ring-1 focus:ring-cyan-900/20",
              theme === 'dark' 
                ? "bg-[#050505] border-[#1A1A1A] text-zinc-200 placeholder:text-zinc-700 focus:border-cyan-900/50" 
                : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-cyan-500/50"
            )}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={inputDisabled}
            className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-cyan-400 disabled:opacity-30 transition-colors"
            title="Upload image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={!canSend}
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
            {isBackendOnline === false && (
              <button 
                onClick={onRetry}
                className="ml-1 text-cyan-500 hover:underline flex items-center gap-0.5"
              >
                <RefreshCw className="w-2 h-2" />
                Retry
              </button>
            )}
          </div>
          <span>Latency: 114ms</span>
        </div>
      </div>
    </div>
  );
};
