import { useState, useEffect, useCallback, useRef } from "react";
import { ChatInterface } from "./components/ChatInterface";
import { ThinkingPanel } from "./components/ThinkingPanel";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { ParticleBackground } from "./components/ParticleBackground";
import { Message, ThinkingLog, ThreadState, ChatRun, HistoryRound } from "./types/chat";
import { chatApi, API_BASE, updateApiBase } from "./services/api";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, X, Settings } from "lucide-react";
import { SettingsModal } from "./components/SettingsModal";

const DEFAULT_THREAD_ID = "demo-thread-1";

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
  
  const eventAbortControllerRef = useRef<AbortController | null>(null);
  const threadAbortControllerRef = useRef<AbortController | null>(null);

  // Check backend health
  const checkHealth = useCallback(async () => {
    try {
      await chatApi.healthCheck();
      setIsBackendOnline(true);
      setError(null);
    } catch (err) {
      setIsBackendOnline(false);
      setError("无法连接到后端服务，请检查 ngrok 是否在线。");
    }
  }, []);

  // Fetch thread state on mount and thread change
  const setupThreadEventSource = useCallback((id: string) => {
    if (threadAbortControllerRef.current) {
      threadAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    threadAbortControllerRef.current = controller;

    console.log(`[SSE] Connecting to thread events: ${id}`);
    const url = chatApi.getThreadEventsUrl(id);
    
    const startThreadStream = async () => {
      try {
        console.log(`[SSE] Connecting to thread events: ${url}`);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "Accept": "text/event-stream",
            "ngrok-skip-browser-warning": "true"
          },
          mode: 'cors',
          cache: 'no-store'
        });

        if (!response.ok) {
          if (response.status === 404) {
            console.warn(`[SSE] Thread events not found (404), might be a new thread.`);
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) return;
        setIsBackendOnline(true);
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
            const jsonStr = line.replace("data: ", "").trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              handleSSEEvent(event);
            } catch (e) {
              console.error("解析线程事件失败:", e, jsonStr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log(`[SSE] Thread stream aborted for: ${id}`);
          return;
        }
        console.error("线程事件流连接失败:", err);
        
        // If it's a network error, it might be CORS or connectivity
        if (err.message === "Failed to fetch" || err.name === "TypeError") {
          setIsBackendOnline(false);
          setError("网络连接错误: 无法连接到后端 API。请检查 API 地址是否正确，或后端是否已启动。");
        }

        // Retry after delay
        setTimeout(() => {
          if (!controller.signal.aborted) {
            setupThreadEventSource(id);
          }
        }, 10000); // Increase retry delay to 10s
      }
    };

    startThreadStream();
  }, []);

  const fetchThreadState = useCallback(async () => {
    try {
      const state = await chatApi.getThreadState(threadId);
      setThreadState(state);
      setIsBackendOnline(true);
      
      // If we have history rounds data, populate messages
      if (state.history_rounds_data) {
        const historyMessages: Message[] = [];
        state.history_rounds_data.forEach(round => {
          historyMessages.push({
            id: `${round.round_id}-user`,
            role: "user",
            content: round.user_message,
            timestamp: round.user_at
          });
          historyMessages.push({
            id: `${round.round_id}-assistant`,
            role: "assistant",
            content: round.assistant_message,
            timestamp: round.assistant_at
          });
        });
        setMessages(historyMessages);
      }
    } catch (err) {
      console.error("Failed to fetch thread state:", err);
      setError("Failed to connect to agent backend. Please ensure ngrok is running and you have visited the backend URL once to bypass the warning.");
    }
  }, [threadId]);

  useEffect(() => {
    checkHealth();
    fetchThreadState();
    setupThreadEventSource(threadId);
    return () => {
      if (eventAbortControllerRef.current) {
        eventAbortControllerRef.current.abort();
      }
      if (threadAbortControllerRef.current) {
        threadAbortControllerRef.current.abort();
      }
    };
  }, [fetchThreadState, setupThreadEventSource, threadId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const addThinkingLog = (type: string, message: string, data?: any) => {
    setThinkingLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        message,
        data,
        timestamp: Date.now()
      }
    ]);
  };

  const handleSendMessage = async (content: string) => {
    setIsThinking(true);
    setError(null);
    setThinkingLogs([]); 
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const run = await chatApi.createRun(threadId, content);
      addThinkingLog("run_started", `任务已启动: ${run.run_id}`);
      
      if (eventAbortControllerRef.current) {
        eventAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      eventAbortControllerRef.current = controller;

      // 使用 fetch 替代 EventSource 以支持 Header
      const response = await fetch(chatApi.getEventsUrl(run.run_id), {
        signal: controller.signal,
        headers: {
          "Accept": "text/event-stream",
          "ngrok-skip-browser-warning": "true"
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) throw new Error("无法读取事件流");
      console.log(`[SSE] Stream connected, starting reader...`);
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
          const jsonStr = line.replace("data: ", "").trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            handleSSEEvent(event);
          } catch (e) {
            console.error("解析事件失败:", e, jsonStr);
          }
        }
      }
    } catch (err: any) {
      console.error("发送消息失败:", err);
      setError(err.message || "连接中断");
      setIsThinking(false);
    }
  };

  const handleSSEEvent = (event: any) => {
    const { type, payload } = event;
    console.log(`[SSE] Received event: ${type}`, payload);

    switch (type) {
      case "recall_started":
        addThinkingLog(type, `启动检索模式: ${payload.mode}`, payload);
        break;
      case "question_strategy":
        addThinkingLog(type, "正在制定回答策略...", payload);
        break;
      case "plan_update":
        addThinkingLog(type, "已生成执行计划", payload);
        break;
      case "sub_question_started":
        addThinkingLog(type, `开始处理子问题: ${payload.question}`, payload);
        break;
      case "tool_call":
        const toolName = payload.name || payload.tool_name || payload.tool || "未知工具";
        addThinkingLog(type, `调用工具: ${toolName}`, payload.args || payload);
        break;
      case "tool_result":
        const resultToolName = payload.name || payload.tool_name || payload.tool || "";
        addThinkingLog(type, `工具返回结果 ${resultToolName}`, payload.result || payload);
        break;
      case "assistant_message":
        console.log(`[SSE] Assistant answer: ${payload.answer}`);
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMsg]);
        setIsThinking(false);
        // Also fetch state to update buffer/history
        fetchThreadState();
        break;
      case "flush_started":
        console.log(`[SSE] Flush started`, payload);
        setIsFlushing(true);
        setFlushStatus("FLUSH_STARTED");
        addThinkingLog(type, "Memory Flush Started", payload);
        break;
      case "flush_stage":
        console.log(`[SSE] Flush stage: ${payload.stage} - ${payload.status}`, payload);
        setFlushStatus(`${payload.stage}:${payload.status}`);
        addThinkingLog(type, `Flush Stage: ${payload.stage} (${payload.status})`, payload);
        break;
      case "flush_completed":
        console.log(`[SSE] Flush completed`, payload);
        setIsFlushing(false);
        setFlushStatus(null);
        addThinkingLog(type, "Memory Flush Completed", payload);
        fetchThreadState();
        break;
      case "thread_state_updated":
        console.log(`[SSE] Thread state updated`, payload);
        setThreadState(prev => prev ? { ...prev, ...payload } : payload);
        break;
      case "run_completed":
        console.log(`[SSE] Run completed: ${event.run_id}`);
        addThinkingLog(type, "任务执行完毕", payload);
        setIsThinking(false);
        // Small delay to ensure backend has finished all post-processing
        setTimeout(() => fetchThreadState(), 500);
        break;
      case "run_failed":
        console.error(`[SSE] Run failed:`, payload);
        addThinkingLog(type, "任务执行失败", payload);
        setError(`执行失败: ${payload.error}`);
        setIsThinking(false);
        break;
      default:
        if (type !== "chat_result") {
          addThinkingLog(type, `系统事件: ${type}`, payload);
        }
    }
  };

  const handleFlush = async () => {
    try {
      setIsFlushing(true);
      setFlushStatus("INITIATING");
      await chatApi.flushBuffer(threadId);
    } catch (err) {
      setError("Failed to flush buffer.");
      setIsFlushing(false);
      setFlushStatus(null);
    }
  };

  const handleToggleMode = async () => {
    if (!threadState) return;
    const newMode = threadState.mode === "manual" ? "off" : "manual";
    try {
      await chatApi.setMemoryMode(threadId, newMode);
      fetchThreadState();
    } catch (err) {
      setError("Failed to update memory mode.");
    }
  };

  const handleToggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  const handleNewThread = () => {
    const newId = `thread-${Math.random().toString(36).substring(7)}`;
    setThreadId(newId);
    setMessages([]);
    setThinkingLogs([]);
  };

  const handleSelectRound = (round: HistoryRound) => {
    // Scroll to or highlight round? For now just log
    addThinkingLog("history_recall", `Inspecting round: ${round.round_id}`, round);
  };

  const handleRetry = () => {
    setIsBackendOnline(null);
    setError(null);
    checkHealth();
    fetchThreadState();
    setupThreadEventSource(threadId);
  };

  const handleUpdateApiUrl = (newUrl: string) => {
    updateApiBase(newUrl);
    setCurrentApiUrl(newUrl);
    handleRetry();
  };

  return (
    <div className="flex h-screen w-full text-zinc-200 overflow-hidden font-sans selection:bg-cyan-500/30 relative">
      <ParticleBackground theme={theme} />
      <ThreadSidebar 
        threadState={threadState} 
        onNewThread={handleNewThread}
        onSelectRound={handleSelectRound}
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
          onOpenSettings={() => setIsSettingsOpen(true)}
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
                Visit Backend to Clear Warning &rarr;
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
      />
    </div>
  );
}
