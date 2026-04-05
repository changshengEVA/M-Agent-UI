import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, X } from "lucide-react";
import { ChatInterface } from "./components/ChatInterface";
import { ThinkingPanel } from "./components/ThinkingPanel";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { ParticleBackground } from "./components/ParticleBackground";
import { SettingsModal } from "./components/SettingsModal";
import { AuthPanel } from "./components/AuthPanel";
import { ScheduleModal } from "./components/ScheduleModal";
import {
  AuthUser,
  DialogueDetail,
  DialogueSummary,
  HistoryRound,
  Message,
  ThinkingLog,
  ThreadState,
} from "./types/chat";
import { API_BASE, chatApi, clearAuthToken, getAuthToken, updateApiBase } from "./services/api";

const DEFAULT_THREAD_ID = "demo-thread-1";
const ACTIVE_THREAD_KEY_PREFIX = "M_AGENT_ACTIVE_THREAD_ID:";

const threadStorageKey = (username: string) => {
  const safeUser = String(username || "").trim().toLowerCase();
  return `${ACTIVE_THREAD_KEY_PREFIX}${safeUser}`;
};

const loadActiveThreadId = (username: string): string => {
  if (typeof window === "undefined") return "";
  const raw = localStorage.getItem(threadStorageKey(username)) || "";
  const safe = String(raw || "").trim();
  return safe;
};

const saveActiveThreadId = (username: string, threadId: string) => {
  if (typeof window === "undefined") return;
  const safeThread = String(threadId || "").trim();
  if (!safeThread) return;
  localStorage.setItem(threadStorageKey(username), safeThread);
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinkingLogs, setThinkingLogs] = useState<ThinkingLog[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushStatus, setFlushStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [threadId, setThreadId] = useState(DEFAULT_THREAD_ID);
  const [threadState, setThreadState] = useState<ThreadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentApiUrl, setCurrentApiUrl] = useState(API_BASE);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [dialogues, setDialogues] = useState<DialogueSummary[]>([]);
  const [dialoguesLoading, setDialoguesLoading] = useState(false);
  const [dialoguesError, setDialoguesError] = useState<string | null>(null);
  const [selectedDialogue, setSelectedDialogue] = useState<DialogueDetail | null>(null);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleRefreshToken, setScheduleRefreshToken] = useState(0);

  const eventAbortControllerRef = useRef<AbortController | null>(null);
  const threadAbortControllerRef = useRef<AbortController | null>(null);

  const cleanupStreams = useCallback(() => {
    if (eventAbortControllerRef.current) {
      eventAbortControllerRef.current.abort();
      eventAbortControllerRef.current = null;
    }
    if (threadAbortControllerRef.current) {
      threadAbortControllerRef.current.abort();
      threadAbortControllerRef.current = null;
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      await chatApi.healthCheck();
      setIsBackendOnline(true);
    } catch {
      setIsBackendOnline(false);
    }
  }, []);

  const forceLogout = useCallback(async () => {
    cleanupStreams();
    clearAuthToken();
    setAuthUser(null);
    setThreadState(null);
    setDialogues([]);
    setDialoguesError(null);
    setSelectedDialogue(null);
    setSelectedDialogueId(null);
    setMessages([]);
    setThinkingLogs([]);
    setIsThinking(false);
    setIsFlushing(false);
    setFlushStatus(null);
    setIsScheduleOpen(false);
  }, [cleanupStreams]);

  const handleApiError = useCallback(
    async (err: any, fallbackMessage: string) => {
      const message = String(err?.message || fallbackMessage);
      setError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    },
    [forceLogout],
  );

  const fetchThreadState = useCallback(async () => {
    if (!authUser) return;
    try {
      const state = await chatApi.getThreadState(threadId);
      setThreadState(state);
      setIsBackendOnline(true);

      if (state.history_rounds_data) {
        const historyMessages: Message[] = [];
        state.history_rounds_data.forEach((round) => {
          if (round.source !== "schedule") {
            historyMessages.push({
              id: `${round.round_id}-user`,
              role: "user",
              content: round.user_message,
              timestamp: round.user_at,
            });
          }
          historyMessages.push({
            id: `${round.round_id}-assistant`,
            role: "assistant",
            content: round.assistant_message,
            timestamp: round.assistant_at,
          });
        });
        setMessages(historyMessages);
      }
    } catch (err) {
      await handleApiError(err, "获取线程状态失败");
    }
  }, [authUser, threadId, handleApiError]);

  const fetchDialogues = useCallback(async () => {
    if (!authUser) return;
    setDialoguesLoading(true);
    setDialoguesError(null);
    try {
      const payload = await chatApi.listDialogues({ limit: 80, offset: 0 });
      setDialogues(Array.isArray(payload.items) ? payload.items : []);
      setIsBackendOnline(true);
    } catch (err: any) {
      const message = String(err?.message || "Failed to load stored dialogues");
      setDialoguesError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    } finally {
      setDialoguesLoading(false);
    }
  }, [authUser, forceLogout]);

  const addThinkingLog = (type: string, message: string, data?: any) => {
    setThinkingLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        type,
        message,
        data,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleSSEEvent = useCallback(
    (event: any) => {
      const { type, payload } = event;
      switch (type) {
        case "recall_started":
          addThinkingLog(type, `启动检索模式: ${payload?.mode || "unknown"}`, payload);
          break;
        case "question_strategy":
          addThinkingLog(type, "正在制定回答策略", payload);
          break;
        case "plan_update":
          addThinkingLog(type, "已更新执行计划", payload);
          break;
        case "sub_question_started":
          addThinkingLog(type, `开始处理子问题: ${payload?.question || ""}`, payload);
          break;
        case "tool_call":
          addThinkingLog(type, `调用工具: ${payload?.tool_name || payload?.tool || "unknown"}`, payload);
          break;
        case "tool_result":
          addThinkingLog(type, `工具返回: ${payload?.tool_name || payload?.tool || "unknown"}`, payload);
          break;
        case "assistant_message":
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: String(payload?.answer || ""),
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsThinking(false);
          fetchThreadState();
          break;
        case "flush_started":
          setIsFlushing(true);
          setFlushStatus("FLUSH_STARTED");
          addThinkingLog(type, "Memory Flush Started", payload);
          break;
        case "flush_stage":
          setFlushStatus(`${payload?.stage || "stage"}:${payload?.status || "pending"}`);
          addThinkingLog(type, `Flush Stage: ${payload?.stage || ""}`, payload);
          break;
        case "flush_completed":
          setIsFlushing(false);
          setFlushStatus(null);
          addThinkingLog(type, "Memory Flush Completed", payload);
          fetchThreadState();
          fetchDialogues();
          break;
        case "thread_state_updated":
          if (payload?.thread_state) {
            setThreadState(payload.thread_state);
          } else if (payload?.thread_id) {
            setThreadState((prev) => (prev ? { ...prev, ...payload } : payload));
          }
          break;
        case "run_completed":
          setIsThinking(false);
          addThinkingLog(type, "任务执行完成", payload);
          setScheduleRefreshToken((prev) => prev + 1);
          setTimeout(() => fetchThreadState(), 300);
          break;
        case "run_failed":
          setIsThinking(false);
          setError(String(payload?.error || "任务执行失败"));
          break;
        case "schedule_created":
          addThinkingLog(type, "日程已创建", payload);
          setScheduleRefreshToken((prev) => prev + 1);
          break;
        case "schedule_updated":
          addThinkingLog(type, "日程已更新", payload);
          setScheduleRefreshToken((prev) => prev + 1);
          break;
        case "schedule_canceled":
          addThinkingLog(type, "日程已取消", payload);
          setScheduleRefreshToken((prev) => prev + 1);
          break;
        default:
          if (type !== "chat_result") {
            addThinkingLog(type, `系统事件: ${type}`, payload);
          }
      }
    },
    [fetchDialogues, fetchThreadState],
  );

  const setupThreadEventSource = useCallback(
    (id: string) => {
      if (!authUser) return;
      if (threadAbortControllerRef.current) {
        threadAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      threadAbortControllerRef.current = controller;

      const run = async () => {
        try {
          const response = await fetch(chatApi.getThreadEventsUrl(id), {
            signal: controller.signal,
            headers: chatApi.getSSEHeaders(),
            mode: "cors",
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(`[${response.status}] thread events stream failed`);
          }
          if (!response.body) return;

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                handleSSEEvent(JSON.parse(jsonStr));
              } catch {
                // ignore malformed chunk
              }
            }
          }
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          const message = String(err?.message || "");
          if (message.startsWith("[401]")) {
            forceLogout();
            return;
          }
          setTimeout(() => {
            if (!controller.signal.aborted) {
              setupThreadEventSource(id);
            }
          }, 5000);
        }
      };

      run();
    },
    [authUser, handleSSEEvent, forceLogout],
  );

  const handleSendMessage = async (content: string) => {
    if (!authUser) {
      setError("请先登录");
      return;
    }
    setSelectedDialogue(null);
    setSelectedDialogueId(null);
    setIsThinking(true);
    setError(null);
    setThinkingLogs([]);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const run = await chatApi.createRun(threadId, content);
      addThinkingLog("run_started", `任务已启动: ${run.run_id}`);

      if (eventAbortControllerRef.current) {
        eventAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      eventAbortControllerRef.current = controller;

      const response = await fetch(chatApi.getEventsUrl(run.run_id), {
        signal: controller.signal,
        headers: chatApi.getSSEHeaders(),
        mode: "cors",
      });
      if (!response.ok) {
        throw new Error(`[${response.status}] run events stream failed`);
      }
      if (!response.body) {
        throw new Error("无法读取事件流");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            handleSSEEvent(JSON.parse(jsonStr));
          } catch {
            // ignore malformed chunk
          }
        }
      }
    } catch (err) {
      await handleApiError(err, "发送消息失败");
      setIsThinking(false);
    }
  };

  const handleFlush = async () => {
    if (!authUser) return;
    try {
      setIsFlushing(true);
      setFlushStatus("INITIATING");
      await chatApi.flushBuffer(threadId);
    } catch (err) {
      await handleApiError(err, "刷新缓存失败");
      setIsFlushing(false);
      setFlushStatus(null);
    }
  };

  const handleToggleMode = async () => {
    if (!authUser || !threadState) return;
    const newMode = threadState.mode === "manual" ? "off" : "manual";
    try {
      await chatApi.setMemoryMode(threadId, newMode);
      fetchThreadState();
    } catch (err) {
      await handleApiError(err, "切换记忆模式失败");
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleNewThread = () => {
    const newId = `thread-${Math.random().toString(36).slice(2, 8)}`;
    setThreadId(newId);
    setMessages([]);
    setThinkingLogs([]);
    setSelectedDialogue(null);
    setSelectedDialogueId(null);
  };

  const handleSelectRound = (round: HistoryRound) => {
    addThinkingLog("history_recall", `Inspecting round: ${round.round_id}`, round);
  };

  const handleSelectDialogue = async (item: DialogueSummary) => {
    if (!authUser) return;
    setSelectedDialogueId(item.dialogue_id);
    setDialoguesError(null);
    try {
      const detail = await chatApi.getDialogue(item.dialogue_id);
      setSelectedDialogue(detail);
      addThinkingLog("dialogue_loaded", `Loaded stored dialogue: ${item.dialogue_id}`, {
        dialogue_id: item.dialogue_id,
        turn_count: detail.turn_count,
      });
    } catch (err: any) {
      const message = String(err?.message || "Failed to load dialogue detail");
      setDialoguesError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    }
  };

  const handleRetry = () => {
    setIsBackendOnline(null);
    setError(null);
    checkHealth();
    if (authUser) {
      fetchThreadState();
      fetchDialogues();
      setupThreadEventSource(threadId);
    }
  };

  const handleUpdateApiUrl = (newUrl: string) => {
    updateApiBase(newUrl);
    setCurrentApiUrl(newUrl);
    handleRetry();
  };

  const handleLogout = async () => {
    try {
      await chatApi.logout();
    } catch {
      clearAuthToken();
    }
    await forceLogout();
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!authUser) return;
    saveActiveThreadId(authUser.username, threadId);
  }, [authUser, threadId]);

  useEffect(() => {
    const bootstrap = async () => {
      await checkHealth();
      const token = getAuthToken();
      if (!token) {
        setAuthBooting(false);
        return;
      }
      try {
        const me = await chatApi.me();
        if (me.user) {
          const restoredThreadId = loadActiveThreadId(me.user.username) || DEFAULT_THREAD_ID;
          setThreadId(restoredThreadId);
          setAuthUser(me.user);
        } else {
          clearAuthToken();
        }
      } catch {
        clearAuthToken();
      } finally {
        setAuthBooting(false);
      }
    };
    bootstrap();
  }, [checkHealth]);

  useEffect(() => {
    if (!authUser) {
      cleanupStreams();
      return;
    }
    fetchThreadState();
    fetchDialogues();
    setupThreadEventSource(threadId);
    return cleanupStreams;
  }, [authUser, threadId, fetchDialogues, fetchThreadState, setupThreadEventSource, cleanupStreams]);

  return (
    <div className="flex h-screen w-full text-zinc-200 overflow-hidden font-sans selection:bg-cyan-500/30 relative">
      <ParticleBackground theme={theme} active={Boolean(authUser)} />

      {authBooting ? (
        <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">Booting...</div>
      ) : !authUser ? (
        <main className="w-full h-full relative">
          <AuthPanel
            theme={theme}
            onAuthenticated={(user) => {
              const restoredThreadId = loadActiveThreadId(user.username) || DEFAULT_THREAD_ID;
              setThreadId(restoredThreadId);
              setAuthUser(user);
              setError(null);
              setMessages([]);
              setThinkingLogs([]);
              setSelectedDialogue(null);
              setSelectedDialogueId(null);
            }}
          />
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            apiUrl={currentApiUrl}
            onSave={handleUpdateApiUrl}
            theme={theme}
            authUser={authUser}
            onUserUpdated={(user) => setAuthUser(user)}
          />
        </main>
      ) : (
        <>
          <ThreadSidebar
            threadState={threadState}
            onNewThread={handleNewThread}
            onSelectRound={handleSelectRound}
            dialogues={dialogues}
            dialoguesLoading={dialoguesLoading}
            dialoguesError={dialoguesError}
            selectedDialogue={selectedDialogue}
            selectedDialogueId={selectedDialogueId}
            onSelectDialogue={handleSelectDialogue}
            isFlushing={isFlushing}
            flushStatus={flushStatus}
            theme={theme}
          />

          <main className="flex-1 flex flex-col relative">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isThinking={isThinking}
              isFlushing={isFlushing}
              threadState={threadState}
              onFlush={handleFlush}
              onToggleMode={handleToggleMode}
              onToggleTheme={handleToggleTheme}
              onRetry={handleRetry}
              theme={theme}
              isBackendOnline={isBackendOnline}
              onOpenSchedules={() => setIsScheduleOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onLogout={handleLogout}
              authLabel={authUser.display_name || authUser.username}
            />

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-rose-950/80 border border-rose-500/50 text-rose-200 rounded-sm flex flex-col gap-2 backdrop-blur-md shadow-lg min-w-[300px]"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    <div className="flex flex-col">
                      <span className="text-sm font-mono">{error}</span>
                      <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-[10px] text-cyan-400 hover:underline text-left mt-1 uppercase tracking-widest"
                      >
                        Update API URL &rarr;
                      </button>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto p-1 hover:bg-rose-500/20 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <a
                    href={currentApiUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] uppercase tracking-widest text-cyan-400 hover:underline ml-8"
                  >
                    Open Backend &rarr;
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <ThinkingPanel logs={thinkingLogs} isThinking={isThinking} theme={theme} />

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            apiUrl={currentApiUrl}
            onSave={handleUpdateApiUrl}
            theme={theme}
            authUser={authUser}
            onUserUpdated={(user) => setAuthUser(user)}
          />

          <ScheduleModal
            isOpen={isScheduleOpen}
            onClose={() => setIsScheduleOpen(false)}
            theme={theme}
            threadId={threadId}
            refreshToken={scheduleRefreshToken}
            onApiError={handleApiError}
          />
        </>
      )}
    </div>
  );
}
