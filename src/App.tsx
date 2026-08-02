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
import { SceneTimelinePanel } from "./components/SceneTimelinePanel";
import { DialogueUploadModal } from "./components/DialogueUploadModal";
import { HistoryWindow } from "./components/HistoryWindow";
import {
  AuthUser,
  DialogueDetail,
  DialogueSummary,
  HistoryRound,
  ImageAttachment,
  Message,
  SceneEntry,
  RuntimeTransaction,
  ThinkingLog,
  ThreadState,
} from "./types/chat";
import { API_BASE, chatApi, clearAuthToken, getAuthToken, updateApiBase } from "./services/api";
import { resolveCanonicalThreadId } from "./lib/canonicalThread";
import {
  isProductRuntimeProfile,
  runtimeFromPayload,
  runtimePhaseFromState,
  isRuntimeProcessing,
} from "./lib/runtimeState";
import type { RuntimePhase } from "./types/chat";
import {
  mergeThreadMessages,
  messagesFromThreadState,
  upsertChatMessage,
} from "./lib/threadMessages";

const BUFFER_VIAL_MAX = 12;
const DIALOGUE_PAGE_SIZE = 80;

const normalizeImageUrl = (url?: string | null): string | undefined => {
  const safe = String(url || "").trim();
  if (!safe) return undefined;
  if (/^https?:\/\//i.test(safe)) return safe;
  return `${API_BASE}${safe.startsWith("/") ? safe : `/${safe}`}`;
};

const turnToAttachments = (turn?: {
  img_url?: string | null;
  img_file?: string | null;
  blip_caption?: string | null;
  upload_id?: string | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
} | null): ImageAttachment[] => {
  if (!turn) return [];
  const imageUrl = normalizeImageUrl(turn.img_url);
  const imageFile = String(turn.img_file || "").trim();
  const blipCaption = String(turn.blip_caption || "").trim();
  if (!imageUrl && !imageFile && !blipCaption) return [];
  return [
    {
      upload_id: String(turn.upload_id || "").trim() || undefined,
      image_url: imageUrl,
      image_file: imageFile || undefined,
      blip_caption: blipCaption || undefined,
      mime_type: String(turn.mime_type || "").trim() || undefined,
      width: typeof turn.width === "number" ? turn.width : undefined,
      height: typeof turn.height === "number" ? turn.height : undefined,
    },
  ];
};

const dialogueToMessages = (detail: DialogueDetail, user: AuthUser): Message[] => {
  const userSpeakers = new Set(
    [
      detail.user_id,
      detail.participants?.[0],
      user.username,
      user.display_name,
      "user",
      "human",
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const fallbackTimestamp = String(detail.meta?.start_time || new Date().toISOString());

  return (detail.turns || []).map((turn, index) => ({
    id: `dialogue-${detail.dialogue_id}-${turn.turn_id ?? index}`,
    role: userSpeakers.has(String(turn.speaker || "").trim().toLowerCase())
      ? "user"
      : "assistant",
    content: String(turn.text || ""),
    timestamp: String(turn.timestamp || fallbackTimestamp),
    attachments: turnToAttachments(turn),
  }));
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinkingLogs, setThinkingLogs] = useState<ThinkingLog[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStoppingThinking, setIsStoppingThinking] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [runtimeProfile, setRuntimeProfile] = useState("legacy");
  const [sceneEntries, setSceneEntries] = useState<SceneEntry[]>([]);
  const [scenePanelOpen, setScenePanelOpen] = useState(false);
  const [transactions, setTransactions] = useState<RuntimeTransaction[]>([]);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [cpuTransactionId, setCpuTransactionId] = useState<string | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [transactionsUpdatedAt, setTransactionsUpdatedAt] = useState<string | null>(null);
  const [transactionResetToken, setTransactionResetToken] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushStatus, setFlushStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [threadId, setThreadId] = useState("");
  const [threadState, setThreadState] = useState<ThreadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentApiUrl, setCurrentApiUrl] = useState(API_BASE);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [dialogues, setDialogues] = useState<DialogueSummary[]>([]);
  const [dialoguesLoading, setDialoguesLoading] = useState(false);
  const [dialoguesLoadingMore, setDialoguesLoadingMore] = useState(false);
  const [dialoguesError, setDialoguesError] = useState<string | null>(null);
  const [dialoguesLoadMoreError, setDialoguesLoadMoreError] = useState<string | null>(null);
  const [dialoguesTotal, setDialoguesTotal] = useState(0);
  const [dialoguesNextOffset, setDialoguesNextOffset] = useState<number | null>(null);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryRoundId, setSelectedHistoryRoundId] = useState<string | null>(null);
  const [selectedHistoryDialogueId, setSelectedHistoryDialogueId] = useState<string | null>(null);
  const [historyDialogueDetail, setHistoryDialogueDetail] = useState<DialogueDetail | null>(null);
  const [historyDialogueLoading, setHistoryDialogueLoading] = useState(false);
  const [historyDialogueError, setHistoryDialogueError] = useState<string | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleRefreshToken, setScheduleRefreshToken] = useState(0);
  const [dialogueUploadOpen, setDialogueUploadOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    previewUrl: string;
    fileName: string;
    isUploading: boolean;
    blipCaption?: string;
  } | null>(null);
  /** Turns in the current Runtime flush segment (legacy uses pending_rounds). */
  const [runtimeSegmentTurns, setRuntimeSegmentTurns] = useState(0);

  const eventAbortControllerRef = useRef<AbortController | null>(null);
  const threadAbortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);
  const selectedDialogueIdRef = useRef<string | null>(null);
  const dialogueRequestIdRef = useRef(0);
  const historyDialogueRequestIdRef = useRef(0);
  const dialogueListRequestIdRef = useRef(0);
  const threadStateRequestIdRef = useRef(0);
  const sceneRequestIdRef = useRef(0);
  const transactionRequestIdRef = useRef(0);
  const transactionMutationRequestIdRef = useRef(0);
  const transactionFetchAbortControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const handleSSEEventRef = useRef<(event: any) => void>(() => {});
  const fetchThreadStateRef = useRef<(options?: { syncMessages?: boolean }) => Promise<void>>(
    async () => undefined,
  );
  const fetchDialoguesRef = useRef<() => Promise<void>>(async () => undefined);
  const fetchSceneRef = useRef<() => Promise<void>>(async () => undefined);
  const fetchTransactionsRef = useRef<() => Promise<void>>(async () => undefined);
  const transactionRefreshTimerRef = useRef<number | null>(null);

  const isProductRuntime =
    isProductRuntimeProfile(runtimeProfile) ||
    isProductRuntimeProfile(threadState?.runtime?.runtime_profile);
  const runtimePhase: RuntimePhase = isProductRuntime
    ? runtimePhaseFromState(threadState?.runtime)
    : "ready";
  const showProcessing = stopRequested
    ? false
    : isProductRuntime
      ? isRuntimeProcessing(runtimePhase)
      : isThinking;
  const bufferVialCount = isProductRuntime
    ? threadState?.scene_pending_turns ?? runtimeSegmentTurns
    : threadState?.pending_rounds || 0;
  const historyRounds =
    threadState?.history_rounds_data?.length
      ? threadState.history_rounds_data
      : threadState?.history_preview || [];
  const historyRecordCount =
    (threadState?.history_rounds || historyRounds.length) + dialoguesTotal;

  const cleanupStreams = useCallback(() => {
    if (eventAbortControllerRef.current) {
      eventAbortControllerRef.current.abort();
      eventAbortControllerRef.current = null;
    }
    if (threadAbortControllerRef.current) {
      threadAbortControllerRef.current.abort();
      threadAbortControllerRef.current = null;
    }
    if (transactionRefreshTimerRef.current !== null) {
      window.clearTimeout(transactionRefreshTimerRef.current);
      transactionRefreshTimerRef.current = null;
    }
    if (transactionFetchAbortControllerRef.current) {
      transactionFetchAbortControllerRef.current.abort();
      transactionFetchAbortControllerRef.current = null;
    }
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const health = await chatApi.healthCheck();
      const profile = String(health?.runtime?.runtime_profile || "legacy");
      setRuntimeProfile(profile);
      if (!isProductRuntimeProfile(profile)) {
        setThreadState((previous) =>
          previous ? { ...previous, runtime: undefined } : previous,
        );
      }
      setIsBackendOnline(true);
    } catch {
      setIsBackendOnline(false);
    }
  }, []);

  const fetchScene = useCallback(async () => {
    if (!authUser) return;
    const profile = isProductRuntimeProfile(runtimeProfile)
      ? runtimeProfile
      : threadState?.runtime?.runtime_profile;
    const requestId = sceneRequestIdRef.current + 1;
    sceneRequestIdRef.current = requestId;
    if (!isProductRuntimeProfile(profile)) {
      setSceneEntries([]);
      return;
    }
    try {
      // Keep the full audit tail of the current conversation. The backend
      // still scopes this request to its active conversation_id, so a flush
      // cannot leak old-conversation Scene into transaction matching or UI.
      const scene = await chatApi.getScene(threadId, { limit: 200, since_flush: false });
      if (sceneRequestIdRef.current !== requestId) return;
      setSceneEntries(scene.entries || []);
    } catch {
      // scene optional
    }
  }, [authUser, runtimeProfile, threadId, threadState?.runtime?.runtime_profile]);

  const fetchTransactions = useCallback(async () => {
    if (!authUser) return;
    const profile = isProductRuntimeProfile(runtimeProfile)
      ? runtimeProfile
      : threadState?.runtime?.runtime_profile;
    const requestId = transactionRequestIdRef.current + 1;
    transactionRequestIdRef.current = requestId;
    transactionFetchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    transactionFetchAbortControllerRef.current = controller;
    if (!isProductRuntimeProfile(profile)) {
      setTransactions([]);
      setActiveTransactionId(null);
      setCpuTransactionId(null);
      setTransactionsError(null);
      setTransactionsLoading(false);
      transactionFetchAbortControllerRef.current = null;
      return;
    }
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const payload = await chatApi.getTransactions(threadId, {
        signal: controller.signal,
      });
      if (transactionRequestIdRef.current !== requestId) return;
      const responseConversationId = String(payload.conversation_id || "").trim();
      const activeConversationId = activeConversationIdRef.current;
      if (
        responseConversationId &&
        activeConversationId &&
        responseConversationId !== activeConversationId
      ) {
        return;
      }
      if (responseConversationId && !activeConversationId) {
        activeConversationIdRef.current = responseConversationId;
      }
      setTransactions(payload.transactions || []);
      setActiveTransactionId(payload.active_transaction_id ?? null);
      setCpuTransactionId(payload.cpu_transaction_id ?? null);
      setTransactionsUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      if (transactionRequestIdRef.current !== requestId) return;
      if (err?.name === "AbortError") return;
      setTransactionsError(String(err?.message || "Failed to load transactions"));
    } finally {
      if (transactionRequestIdRef.current === requestId) {
        setTransactionsLoading(false);
        if (transactionFetchAbortControllerRef.current === controller) {
          transactionFetchAbortControllerRef.current = null;
        }
      }
    }
  }, [authUser, runtimeProfile, threadId, threadState?.runtime?.runtime_profile]);

  const refreshTransactionsSoon = useCallback(() => {
    if (transactionRefreshTimerRef.current !== null) {
      window.clearTimeout(transactionRefreshTimerRef.current);
    }
    transactionRefreshTimerRef.current = window.setTimeout(() => {
      transactionRefreshTimerRef.current = null;
      void fetchTransactionsRef.current();
    }, 120);
  }, []);

  const refreshRuntimePanels = useCallback(() => {
    void fetchScene();
    refreshTransactionsSoon();
  }, [fetchScene, refreshTransactionsSoon]);

  const applyTransactionDeletion = useCallback((payload: any): boolean => {
    const projected = (payload?.transaction || payload?.tombstone || payload) as
      | Partial<RuntimeTransaction>
      | undefined;
    const transactionId = String(projected?.transaction_id || payload?.transaction_id || "").trim();
    if (!transactionId) return false;
    const responseConversationId = String(
      payload?.conversation_id || projected?.conversation_id || "",
    ).trim();
    if (
      responseConversationId &&
      activeConversationIdRef.current &&
      responseConversationId !== activeConversationIdRef.current
    ) {
      return false;
    }

    setTransactions((previous) =>
      previous.map((transaction) =>
        transaction.transaction_id === transactionId
          ? {
              ...transaction,
              ...projected,
              transaction_id: transactionId,
              lifecycle_status: "deleted",
              deleted: true,
              is_active_user: false,
              is_cpu_holder: false,
            }
          : transaction,
      ),
    );
    if (Object.prototype.hasOwnProperty.call(payload || {}, "active_transaction_id")) {
      setActiveTransactionId(payload.active_transaction_id || null);
    } else {
      setActiveTransactionId((current) => (current === transactionId ? null : current));
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "cpu_transaction_id")) {
      setCpuTransactionId(payload.cpu_transaction_id || null);
    } else {
      setCpuTransactionId((current) => (current === transactionId ? null : current));
    }
    setTransactionsUpdatedAt(new Date().toISOString());
    return true;
  }, []);

  const handleFlushCompletedUi = useCallback(
    (payload: any, productRuntime: boolean) => {
      const runtimeFlush =
        payload?.runtime_flush && typeof payload.runtime_flush === "object"
          ? payload.runtime_flush
          : null;
      const runtimeFlushCompleted =
        !runtimeFlush ||
        ["complete", "completed"].includes(
          String(runtimeFlush.journal_status || runtimeFlush.status || "")
            .trim()
            .toLowerCase(),
        );
      const nextThreadState =
        payload?.thread_state && typeof payload.thread_state === "object"
          ? (payload.thread_state as ThreadState)
          : null;
      const nextConversationId = nextThreadState
        ? String(nextThreadState.conversation_id || "").trim() || null
        : null;
      if (payload?.success === false) {
        if (nextThreadState) {
          activeConversationIdRef.current = nextConversationId;
          setThreadState(nextThreadState);
        }
        void fetchThreadStateRef.current({ syncMessages: !productRuntime });
        if (productRuntime) {
          void fetchSceneRef.current();
          void fetchTransactionsRef.current();
        }
        return;
      }

      // A successful flush advances the conversation boundary. Until the
      // authoritative state is known, clear the old id so a fresh response can establish it.
      activeConversationIdRef.current = nextConversationId;

      threadStateRequestIdRef.current += 1;
      sceneRequestIdRef.current += 1;
      dialogueListRequestIdRef.current += 1;
      transactionRequestIdRef.current += 1;
      transactionMutationRequestIdRef.current += 1;
      transactionFetchAbortControllerRef.current?.abort();
      transactionFetchAbortControllerRef.current = null;
      if (transactionRefreshTimerRef.current !== null) {
        window.clearTimeout(transactionRefreshTimerRef.current);
        transactionRefreshTimerRef.current = null;
      }

      setTransactions([]);
      setActiveTransactionId(null);
      setCpuTransactionId(null);
      setTransactionsError(null);
      setTransactionsUpdatedAt(null);
      setTransactionsLoading(false);
      setTransactionResetToken((value) => value + 1);
      setSceneEntries([]);
      if (nextThreadState) setThreadState(nextThreadState);
      if (
        productRuntime &&
        payload?.success !== false &&
        runtimeFlushCompleted
      ) {
        setRuntimeSegmentTurns(0);
      }

      void fetchThreadStateRef.current({ syncMessages: !productRuntime });
      void fetchDialoguesRef.current();
      if (productRuntime) {
        void fetchSceneRef.current();
        void fetchTransactionsRef.current();
      }
    },
    [],
  );

  const forceLogout = useCallback(async () => {
    cleanupStreams();
    clearAuthToken();
    setAuthUser(null);
    setThreadId("");
    setThreadState(null);
    setRuntimeProfile("legacy");
    setSceneEntries([]);
    setScenePanelOpen(false);
    sceneRequestIdRef.current += 1;
    transactionRequestIdRef.current += 1;
    transactionMutationRequestIdRef.current += 1;
    activeConversationIdRef.current = null;
    dialogueListRequestIdRef.current += 1;
    threadStateRequestIdRef.current += 1;
    setDialogues([]);
    setDialoguesTotal(0);
    setDialoguesNextOffset(null);
    setDialoguesLoading(false);
    setDialoguesLoadingMore(false);
    setDialoguesError(null);
    setDialoguesLoadMoreError(null);
    setHistoryOpen(false);
    setSelectedHistoryRoundId(null);
    setSelectedHistoryDialogueId(null);
    setHistoryDialogueDetail(null);
    setHistoryDialogueError(null);
    setHistoryDialogueLoading(false);
    historyDialogueRequestIdRef.current += 1;
    selectedDialogueIdRef.current = null;
    dialogueRequestIdRef.current += 1;
    setSelectedDialogueId(null);
    setMessages([]);
    setThinkingLogs([]);
    setIsThinking(false);
    setIsStoppingThinking(false);
    setStopRequested(false);
    setIsFlushing(false);
    setFlushStatus(null);
    setIsScheduleOpen(false);
    setTransactions([]);
    setActiveTransactionId(null);
    setCpuTransactionId(null);
    setTransactionsError(null);
    setTransactionsUpdatedAt(null);
    setTransactionsLoading(false);
    setTransactionResetToken((value) => value + 1);
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

  const applyThreadMessages = useCallback(
    (state: ThreadState, profileHint?: string) => {
      if (selectedDialogueIdRef.current) return;
      const preferScene = isProductRuntimeProfile(
        profileHint ||
          state?.runtime?.runtime_profile ||
          runtimeProfile,
      );
      const restored = messagesFromThreadState(state, turnToAttachments, {
        preferSceneConversation: preferScene,
      });
      if (restored.length === 0 && !preferScene) return;
      setMessages((prev) => mergeThreadMessages(prev, restored));
    },
    [runtimeProfile],
  );

  const fetchThreadState = useCallback(
    async (options?: { syncMessages?: boolean }) => {
    if (!authUser) return;
    const requestId = threadStateRequestIdRef.current + 1;
    threadStateRequestIdRef.current = requestId;
    const syncMessages = options?.syncMessages !== false;
    try {
      const state = await chatApi.getThreadState(threadId);
      if (threadStateRequestIdRef.current !== requestId) return;
      activeConversationIdRef.current =
        String(state.conversation_id || "").trim() || null;
      setThreadState(state);
      const stateRuntimeProfile = String(
        state?.runtime?.runtime_profile || "",
      ).trim();
      if (isProductRuntimeProfile(stateRuntimeProfile)) {
        setRuntimeProfile(stateRuntimeProfile);
      }
      setIsBackendOnline(true);

      if (syncMessages && !selectedDialogueIdRef.current) {
        applyThreadMessages(state, stateRuntimeProfile || runtimeProfile);
      }
    } catch (err) {
      if (threadStateRequestIdRef.current !== requestId) return;
      await handleApiError(err, "获取线程状态失败");
    }
  },
    [authUser, threadId, handleApiError, applyThreadMessages, runtimeProfile],
  );

  const fetchDialogues = useCallback(async () => {
    if (!authUser) return;
    const requestId = dialogueListRequestIdRef.current + 1;
    dialogueListRequestIdRef.current = requestId;
    setDialoguesLoading(true);
    setDialoguesLoadingMore(false);
    setDialoguesError(null);
    setDialoguesLoadMoreError(null);
    try {
      const payload = await chatApi.listDialogues({ limit: DIALOGUE_PAGE_SIZE, offset: 0 });
      if (dialogueListRequestIdRef.current !== requestId) return;
      setDialogues(Array.isArray(payload.items) ? payload.items : []);
      setDialoguesTotal(Number(payload.total || payload.items?.length || 0));
      setDialoguesNextOffset(payload.next_offset ?? null);
      setIsBackendOnline(true);
    } catch (err: any) {
      if (dialogueListRequestIdRef.current !== requestId) return;
      const message = String(err?.message || "Failed to load stored dialogues");
      setDialoguesError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    } finally {
      if (dialogueListRequestIdRef.current === requestId) {
        setDialoguesLoading(false);
      }
    }
  }, [authUser, forceLogout]);

  const loadMoreDialogues = useCallback(async () => {
    if (!authUser || dialoguesNextOffset === null || dialoguesLoadingMore) return;
    const requestId = dialogueListRequestIdRef.current + 1;
    dialogueListRequestIdRef.current = requestId;
    setDialoguesLoadingMore(true);
    setDialoguesLoadMoreError(null);
    try {
      const payload = await chatApi.listDialogues({
        limit: DIALOGUE_PAGE_SIZE,
        offset: dialoguesNextOffset,
      });
      if (dialogueListRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setDialogues((previous) => {
        const merged = new Map(previous.map((item) => [item.dialogue_id, item]));
        nextItems.forEach((item) => merged.set(item.dialogue_id, item));
        return Array.from(merged.values());
      });
      setDialoguesTotal(Number(payload.total || 0));
      setDialoguesNextOffset(payload.next_offset ?? null);
    } catch (err: any) {
      if (dialogueListRequestIdRef.current !== requestId) return;
      const message = String(err?.message || "Failed to load more dialogues");
      setDialoguesLoadMoreError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    } finally {
      if (dialogueListRequestIdRef.current === requestId) {
        setDialoguesLoadingMore(false);
      }
    }
  }, [authUser, dialoguesLoadingMore, dialoguesNextOffset, forceLogout]);

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
        case "reply_emitted": {
          const text = String(payload?.message || "");
          const finalize = Boolean(payload?.finalize);
          const streamId = streamingAssistantIdRef.current;
          if (selectedDialogueIdRef.current) {
            // Keep the archived transcript stable while live events continue in the background.
          } else if (streamId) {
            setMessages((prev) =>
              prev.map((item) => (item.id === streamId ? { ...item, content: text || item.content } : item)),
            );
          } else if (text) {
            const newId = `assistant-stream-${Date.now()}`;
            streamingAssistantIdRef.current = finalize ? null : newId;
            setMessages((prev) =>
              upsertChatMessage(prev, {
                id: newId,
                role: "assistant",
                content: text,
                timestamp: new Date().toISOString(),
              }),
            );
          }
          if (finalize) {
            streamingAssistantIdRef.current = null;
            if (!isProductRuntime) {
              setIsThinking(false);
            }
            // Product runtimes keep live bubbles; refresh metadata without wiping chat.
            void fetchThreadState({ syncMessages: true });
            refreshRuntimePanels();
          }
          break;
        }
        case "scene_entry_appended": {
          const entry = payload as SceneEntry;
          if (entry?.seq != null) {
            setSceneEntries((prev) => {
              if (prev.some((item) => item.seq === entry.seq)) return prev;
              return [...prev, entry].sort((a, b) => a.seq - b.seq).slice(-200);
            });
          }
          if (isProductRuntime && !selectedDialogueIdRef.current && entry?.text) {
            if (entry.entry_type === "utterance" && entry.actor === "user") {
              setMessages((prev) =>
                upsertChatMessage(prev, {
                  id: `scene-user-${entry.seq}`,
                  role: "user",
                  content: String(entry.text),
                  timestamp: entry.occurred_at || new Date().toISOString(),
                }),
              );
            } else if (entry.entry_type === "reply") {
              setMessages((prev) =>
                upsertChatMessage(prev, {
                  id: `scene-assistant-${entry.seq}`,
                  role: "assistant",
                  content: String(entry.text),
                  timestamp: entry.occurred_at || new Date().toISOString(),
                }),
              );
              streamingAssistantIdRef.current = null;
            }
          }
          // The entry is already merged locally; only the transaction snapshot
          // needs a debounced refresh here.
          refreshTransactionsSoon();
          break;
        }
        case "transaction_deleted":
          if (applyTransactionDeletion(payload)) {
            addThinkingLog(type, "Transaction deleted", payload);
          }
          refreshTransactionsSoon();
          break;
        case "stimulus_queued":
          setStopRequested(false);
          addThinkingLog(
            type,
            `刺激已入队 (pending=${payload?.pending_count ?? "?"}, phase=${payload?.runtime_phase ?? "?"})`,
            payload,
          );
          setThreadState((prev) =>
            prev
              ? {
                  ...prev,
                  runtime: runtimeFromPayload({
                    pending_stimuli: Number(
                      payload?.pending_count ?? prev.runtime?.pending_stimuli ?? 0,
                    ),
                    runtime_phase: payload?.runtime_phase,
                    effective_depth: payload?.effective_depth,
                    busy: payload?.runtime_phase === "busy",
                    busy_reason: String(payload?.runtime_phase || "queued"),
                    runtime_profile:
                      String(
                        runtimeProfile ||
                          prev.runtime?.runtime_profile ||
                          "",
                      ).trim() || "langgraph_v1",
                  }),
                }
              : prev,
          );
          refreshRuntimePanels();
          break;
        case "thread_runtime_updated":
          if (payload?.thread_runtime) {
            const rt = payload.thread_runtime;
            setThreadState((prev) =>
              prev
                ? {
                    ...prev,
                    runtime: runtimeFromPayload(rt),
                  }
                : prev,
            );
            if (Object.prototype.hasOwnProperty.call(rt, "cpu_transaction_id")) {
              setCpuTransactionId(
                rt.cpu_transaction_id ? String(rt.cpu_transaction_id) : null,
              );
            } else if (Object.prototype.hasOwnProperty.call(rt, "active_transaction_id")) {
              // Thread runtime uses active_transaction_id for the instantaneous
              // CPU holder. The transaction list owns the separate active-user id.
              setCpuTransactionId(
                rt.active_transaction_id ? String(rt.active_transaction_id) : null,
              );
            }
            if (!isRuntimeProcessing(runtimePhaseFromState(runtimeFromPayload(rt)))) {
              streamingAssistantIdRef.current = null;
              setStopRequested(false);
            }
          }
          refreshRuntimePanels();
          break;
        case "thinking_started":
          setStopRequested(false);
          addThinkingLog(type, type.replace(/_/g, " "), payload);
          break;
        case "thinking_plan":
        case "execution_started":
        case "execution_completed":
        case "thinking_summary":
        case "thinking_completed":
          addThinkingLog(type, type.replace(/_/g, " "), payload);
          break;
        case "thinking_force_stopped":
          setIsThinking(false);
          setIsStoppingThinking(false);
          setStopRequested(true);
          streamingAssistantIdRef.current = null;
          addThinkingLog(type, "Thinking force stopped", payload);
          refreshRuntimePanels();
          break;
        case "assistant_message":
          if (!isProductRuntime) {
            setMessages((prev) =>
              selectedDialogueIdRef.current
                ? prev
                : [
                    ...prev,
                    {
                      id: `assistant-${Date.now()}`,
                      role: "assistant",
                      content: String(payload?.answer || ""),
                      timestamp: new Date().toISOString(),
                    },
                  ],
            );
            setIsThinking(false);
            fetchThreadState();
          }
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
          handleFlushCompletedUi(payload, isProductRuntime);
          break;
        case "thread_state_updated":
          if (payload?.thread_state) {
            const nextState = payload.thread_state as ThreadState;
            activeConversationIdRef.current =
              String(nextState.conversation_id || "").trim() || null;
            setThreadState(nextState);
            if (isProductRuntime) {
              applyThreadMessages(nextState);
            }
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
    [
      applyThreadMessages,
      applyTransactionDeletion,
      fetchDialogues,
      fetchThreadState,
      handleFlushCompletedUi,
      isProductRuntime,
      refreshRuntimePanels,
      refreshTransactionsSoon,
      runtimeProfile,
    ],
  );

  handleSSEEventRef.current = handleSSEEvent;
  fetchThreadStateRef.current = fetchThreadState;
  fetchDialoguesRef.current = fetchDialogues;
  fetchSceneRef.current = fetchScene;
  fetchTransactionsRef.current = fetchTransactions;

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
                handleSSEEventRef.current(JSON.parse(jsonStr));
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
    [authUser, forceLogout],
  );

  const handleSendMessage = async (content: string) => {
    if (!authUser) {
      setError("请先登录");
      return;
    }
    selectedDialogueIdRef.current = null;
    dialogueRequestIdRef.current += 1;
    setSelectedDialogueId(null);
    setStopRequested(false);
    if (!isProductRuntime) {
      setIsThinking(true);
    }
    setError(null);
    setThinkingLogs([]);
    streamingAssistantIdRef.current = null;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      attachments: selectedImage
        ? [
            {
              image_url: selectedImage.previewUrl,
              blip_caption: selectedImage.blipCaption,
            },
          ]
        : [],
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      let attachments: ImageAttachment[] = [];
      if (selectedImage) {
        setSelectedImage((prev) => (prev ? { ...prev, isUploading: true } : prev));
        const uploaded = await chatApi.uploadImage(threadId, selectedImage.file);
        attachments = [
          {
            upload_id: uploaded.upload_id,
            image_url: normalizeImageUrl(uploaded.image_url),
            image_file: uploaded.image_file,
            blip_caption: uploaded.blip_caption,
            mime_type: uploaded.mime_type || undefined,
            width: typeof uploaded.width === "number" ? uploaded.width : undefined,
            height: typeof uploaded.height === "number" ? uploaded.height : undefined,
          },
        ];
        setMessages((prev) =>
          prev.map((item) =>
            item.id === userMsg.id
              ? {
                  ...item,
                  attachments,
                }
              : item,
          ),
        );
      }

      if (isProductRuntime) {
        const queued = await chatApi.submitStimulus(threadId, content, attachments);
        setRuntimeSegmentTurns((n) => Math.min(BUFFER_VIAL_MAX, n + 1));
        clearSelectedImage();
        addThinkingLog("stimulus_queued", `已入队: ${queued.stimulus_id}`, queued);
        setThreadState((prev) =>
          prev
            ? {
                ...prev,
                runtime: runtimeFromPayload({
                  pending_stimuli: Number(queued.pending_count ?? 0),
                  runtime_phase: queued.runtime_phase,
                  effective_depth: queued.effective_depth,
                  busy: queued.runtime_phase === "busy",
                  busy_reason: String(queued.runtime_phase || "queued"),
                  runtime_profile:
                    String(runtimeProfile || "").trim() || "langgraph_v1",
                }),
              }
            : prev,
        );
        refreshRuntimePanels();
        return;
      }

      const run = await chatApi.createRun(threadId, content, attachments);
      clearSelectedImage();
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
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setIsThinking(false);
        return;
      }
      await handleApiError(err, "发送消息失败");
      setIsThinking(false);
      setSelectedImage((prev) => (prev ? { ...prev, isUploading: false } : prev));
    }
  };

  const handleStopThinking = async () => {
    if (!authUser || isStoppingThinking || !showProcessing) return;
    setIsStoppingThinking(true);
    setStopRequested(true);
    setIsThinking(false);
    streamingAssistantIdRef.current = null;
    if (eventAbortControllerRef.current) {
      eventAbortControllerRef.current.abort();
      eventAbortControllerRef.current = null;
    }
    try {
      const result = await chatApi.stopThinking(threadId);
      addThinkingLog("thinking_force_stopped", "Thinking force stopped", result);
      if (result.thread_state) {
        const stoppedState = {
          ...result.thread_state,
          runtime: result.thread_state.runtime
            ? {
                ...result.thread_state.runtime,
                pending_stimuli: 0,
                busy: false,
                busy_reason: "idle",
                runtime_phase: "ready" as RuntimePhase,
                effective_depth: 0,
                in_flight_stimulus_id: null,
              }
            : result.thread_state.runtime,
        };
        setThreadState(stoppedState);
      }
      refreshRuntimePanels();
      void fetchThreadState({ syncMessages: false });
    } catch (err) {
      setStopRequested(false);
      await handleApiError(err, "Force stop thinking failed");
    } finally {
      setIsStoppingThinking(false);
    }
  };

  const handleDeleteTransaction = useCallback(
    async (transaction: RuntimeTransaction) => {
      if (!authUser) throw new Error("Sign in before deleting a transaction");
      const revision = Number(transaction.revision);
      if (!Number.isInteger(revision) || revision < 0) {
        throw new Error("Transaction revision is unavailable; refresh and try again");
      }
      const mutationId = transactionMutationRequestIdRef.current + 1;
      transactionMutationRequestIdRef.current = mutationId;
      const requestConversationId = String(
        transaction.conversation_id || activeConversationIdRef.current || "",
      ).trim();
      const result = await chatApi.deleteTransaction(
        threadId,
        transaction.transaction_id,
        revision,
      );
      if (transactionMutationRequestIdRef.current !== mutationId) return result;

      const responseConversationId = String(result.conversation_id || "").trim();
      const currentConversationId = activeConversationIdRef.current;
      if (
        (requestConversationId &&
          currentConversationId &&
          requestConversationId !== currentConversationId) ||
        (responseConversationId &&
          currentConversationId &&
          responseConversationId !== currentConversationId)
      ) {
        void fetchTransactionsRef.current();
        return result;
      }

      applyTransactionDeletion(result);
      // The response makes the tombstone visible immediately after success;
      // the final GET calibrates aggregate active/CPU ids and cleanup races.
      await fetchTransactionsRef.current();
      return result;
    },
    [applyTransactionDeletion, authUser, threadId],
  );

  const handleFlush = async () => {
    if (!authUser) return;
    try {
      setIsFlushing(true);
      setFlushStatus("INITIATING");
      const result = await chatApi.flushBuffer(threadId);
      addThinkingLog("flush", String(result?.message || "flush completed"), result);
      handleFlushCompletedUi(result, isProductRuntime);
    } catch (err) {
      await handleApiError(err, "刷新缓存失败");
    } finally {
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

  const handleSelectImage = (file: File | null) => {
    if (!file) {
      clearSelectedImage();
      return;
    }
    clearSelectedImage();
    const previewUrl = URL.createObjectURL(file);
    setSelectedImage({
      file,
      previewUrl,
      fileName: file.name,
      isUploading: false,
    });
  };

  const handleNewConversation = () => {
    if (!threadState || isFlushing || threadState.has_pending_data) return;
    selectedDialogueIdRef.current = null;
    dialogueRequestIdRef.current += 1;
    setMessages([]);
    setThinkingLogs([]);
    setStopRequested(false);
    setRuntimeSegmentTurns(0);
    setSelectedDialogueId(null);
    setHistoryOpen(false);
    setSelectedHistoryRoundId(null);
    setSelectedHistoryDialogueId(null);
    setHistoryDialogueDetail(null);
    setHistoryDialogueError(null);
    historyDialogueRequestIdRef.current += 1;
    setSceneEntries([]);
    clearSelectedImage();
    void fetchThreadState();
    refreshRuntimePanels();
  };

  const handleSelectRound = (round: HistoryRound) => {
    setSelectedHistoryRoundId(round.round_id);
  };

  const handlePreviewHistoryDialogue = async (item: DialogueSummary) => {
    if (!authUser) return;
    const requestId = historyDialogueRequestIdRef.current + 1;
    historyDialogueRequestIdRef.current = requestId;
    setSelectedHistoryDialogueId(item.dialogue_id);
    setHistoryDialogueDetail(null);
    setHistoryDialogueError(null);
    setHistoryDialogueLoading(true);
    try {
      const detail = await chatApi.getDialogue(item.dialogue_id);
      if (historyDialogueRequestIdRef.current !== requestId) return;
      setHistoryDialogueDetail(detail);
    } catch (err: any) {
      if (historyDialogueRequestIdRef.current !== requestId) return;
      const message = String(err?.message || "Failed to load dialogue detail");
      setHistoryDialogueError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      }
    } finally {
      if (historyDialogueRequestIdRef.current === requestId) {
        setHistoryDialogueLoading(false);
      }
    }
  };

  const handleExitStoredDialogue = () => {
    selectedDialogueIdRef.current = null;
    dialogueRequestIdRef.current += 1;
    setSelectedDialogueId(null);
    setMessages([]);
    void fetchThreadState();
  };

  const handleSelectDialogue = async (item: DialogueSummary): Promise<boolean> => {
    if (!authUser) return false;
    if (selectedDialogueIdRef.current === item.dialogue_id) {
      handleExitStoredDialogue();
      return true;
    }
    const requestId = dialogueRequestIdRef.current + 1;
    dialogueRequestIdRef.current = requestId;
    selectedDialogueIdRef.current = item.dialogue_id;
    setSelectedDialogueId(item.dialogue_id);
    setMessages([]);
    clearSelectedImage();
    setDialoguesError(null);
    try {
      const detail = await chatApi.getDialogue(item.dialogue_id);
      if (dialogueRequestIdRef.current !== requestId) return false;
      setMessages(dialogueToMessages(detail, authUser));
      addThinkingLog("dialogue_loaded", `Loaded stored dialogue: ${item.dialogue_id}`, {
        dialogue_id: item.dialogue_id,
        turn_count: detail.turn_count,
      });
      return true;
    } catch (err: any) {
      if (dialogueRequestIdRef.current !== requestId) return false;
      selectedDialogueIdRef.current = null;
      setSelectedDialogueId(null);
      const message = String(err?.message || "Failed to load dialogue detail");
      setDialoguesError(message);
      if (message.startsWith("[401]")) {
        await forceLogout();
      } else {
        void fetchThreadState();
      }
      return false;
    }
  };

  const handleOpenDialogueFromHistory = async (item: DialogueSummary) => {
    const opened =
      selectedDialogueIdRef.current === item.dialogue_id
        ? true
        : await handleSelectDialogue(item);
    if (opened) setHistoryOpen(false);
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
    clearSelectedImage();
    await forceLogout();
  };

  useEffect(() => {
    if (
      selectedHistoryRoundId &&
      !historyRounds.some((round) => round.round_id === selectedHistoryRoundId)
    ) {
      setSelectedHistoryRoundId(
        historyRounds[historyRounds.length - 1]?.round_id ?? null,
      );
    }
  }, [historyRounds, selectedHistoryRoundId]);

  useEffect(() => {
    if (
      selectedHistoryDialogueId &&
      !dialogues.some(
        (dialogue) => dialogue.dialogue_id === selectedHistoryDialogueId,
      )
    ) {
      historyDialogueRequestIdRef.current += 1;
      setSelectedHistoryDialogueId(null);
      setHistoryDialogueDetail(null);
      setHistoryDialogueError(null);
      setHistoryDialogueLoading(false);
    }
  }, [dialogues, selectedHistoryDialogueId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
          const canonicalThreadId = resolveCanonicalThreadId(me);
          if (!canonicalThreadId) {
            throw new Error("服务器未在 /v1/auth/me 返回规范线程 ID");
          }
          setThreadId(canonicalThreadId);
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
    activeConversationIdRef.current = null;
    transactionMutationRequestIdRef.current += 1;
  }, [authUser?.username, threadId]);

  useEffect(() => {
    if (!authUser) {
      cleanupStreams();
      return;
    }
    // Keep this effect scoped to auth/thread identity so SSE handler churn
    // (product Runtime / profile updates) cannot abort the live stream or
    // race-wipe optimistic chat bubbles mid-turn.
    void fetchThreadStateRef.current({ syncMessages: true });
    void fetchDialoguesRef.current();
    void fetchSceneRef.current();
    void fetchTransactionsRef.current();
    setupThreadEventSource(threadId);
    return cleanupStreams;
  }, [authUser, threadId, setupThreadEventSource, cleanupStreams]);

  useEffect(() => {
    if (!authUser) return;
    if (!isProductRuntimeProfile(runtimeProfile)) {
      if (transactionRefreshTimerRef.current !== null) {
        window.clearTimeout(transactionRefreshTimerRef.current);
        transactionRefreshTimerRef.current = null;
      }
      sceneRequestIdRef.current += 1;
      transactionRequestIdRef.current += 1;
      setSceneEntries([]);
      setScenePanelOpen(false);
      setTransactions([]);
      setActiveTransactionId(null);
      setCpuTransactionId(null);
      setTransactionsError(null);
      setTransactionsUpdatedAt(null);
      setTransactionsLoading(false);
      return;
    }
    void fetchSceneRef.current();
    void fetchTransactionsRef.current();
  }, [authUser, runtimeProfile]);
  return (
    <div className="flex h-screen w-full text-zinc-200 overflow-hidden font-sans selection:bg-cyan-500/30 relative">
      <ParticleBackground theme={theme} active={Boolean(authUser)} />

      {authBooting ? (
        <div className="w-full h-full flex items-center justify-center text-sm text-zinc-400">Booting...</div>
      ) : !authUser ? (
        <main className="w-full h-full relative">
          <AuthPanel
            theme={theme}
            onAuthenticated={async (session) => {
              const user = session.user;
              const canonicalThreadId = resolveCanonicalThreadId(session);
              if (!user || !canonicalThreadId) {
                const message = "服务器未在认证响应中返回规范线程 ID";
                setError(message);
                await forceLogout();
                throw new Error(message);
              }
              setThreadId(canonicalThreadId);
              setAuthUser(user);
              setError(null);
              setMessages([]);
              setThinkingLogs([]);
              selectedDialogueIdRef.current = null;
              dialogueRequestIdRef.current += 1;
              setSelectedDialogueId(null);
              clearSelectedImage();
              void checkHealth();
            }}
          />
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            apiUrl={currentApiUrl}
            onSave={handleUpdateApiUrl}
            theme={theme}
            authUser={authUser}
            onUserUpdated={(user) => {
              setAuthUser(user);
              const canonicalThreadId = resolveCanonicalThreadId({ user });
              if (canonicalThreadId) {
                setThreadId(canonicalThreadId);
              }
            }}
          />
        </main>
      ) : (
        <>
          <ThreadSidebar
            threadState={threadState}
            runtimeProfile={runtimeProfile}
            bufferVialCount={bufferVialCount}
            bufferVialMax={BUFFER_VIAL_MAX}
            onNewConversation={handleNewConversation}
            onOpenHistory={() => {
              if (!selectedHistoryRoundId && historyRounds.length > 0) {
                setSelectedHistoryRoundId(historyRounds[historyRounds.length - 1].round_id);
              }
              setHistoryOpen(true);
            }}
            historyCount={historyRecordCount}
            transactions={transactions}
            activeTransactionId={activeTransactionId}
            cpuTransactionId={cpuTransactionId}
            sceneEntries={sceneEntries}
            transactionsLoading={transactionsLoading}
            transactionsError={transactionsError}
            transactionsUpdatedAt={transactionsUpdatedAt}
            onRefreshTransactions={() => fetchTransactions()}
            onDeleteTransaction={handleDeleteTransaction}
            transactionResetToken={transactionResetToken}
            isFlushing={isFlushing}
            flushStatus={flushStatus}
            theme={theme}
          />

          <HistoryWindow
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            theme={theme}
            currentRounds={historyRounds}
            currentRoundCount={threadState?.history_rounds || historyRounds.length}
            dialogues={dialogues}
            dialogueCount={dialoguesTotal}
            dialoguesLoading={dialoguesLoading}
            dialoguesLoadingMore={dialoguesLoadingMore}
            dialoguesError={dialoguesError}
            dialoguesLoadMoreError={dialoguesLoadMoreError}
            dialoguesHasMore={dialoguesNextOffset !== null}
            selectedRoundId={selectedHistoryRoundId}
            selectedDialogueId={selectedHistoryDialogueId}
            dialogueDetail={historyDialogueDetail}
            dialogueDetailLoading={historyDialogueLoading}
            dialogueDetailError={historyDialogueError}
            onSelectRound={handleSelectRound}
            onSelectDialogue={(dialogue) => void handlePreviewHistoryDialogue(dialogue)}
            onOpenDialogue={(dialogue) => void handleOpenDialogueFromHistory(dialogue)}
            onOpenDialogueUpload={() => setDialogueUploadOpen(true)}
            onLoadMoreDialogues={() => void loadMoreDialogues()}
            dialogueUploadDisabled={isFlushing}
            onRefresh={(tab) => {
              if (tab === "stored") void fetchDialogues();
              else void fetchThreadState({ syncMessages: false });
            }}
          />

          <DialogueUploadModal
            open={dialogueUploadOpen}
            onClose={() => setDialogueUploadOpen(false)}
            theme={theme}
            onCompleted={() => {
              fetchDialogues();
            }}
            onApiError={(message) => void handleApiError(new Error(message), "Dialogue 上传失败")}
          />

          <main className="flex-1 flex flex-col relative">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isThinking={showProcessing}
              runtimeProfile={runtimeProfile}
              runtimePhase={runtimePhase}
              isFlushing={isFlushing}
              threadState={threadState}
              onFlush={handleFlush}
              onStopThinking={handleStopThinking}
              isStoppingThinking={isStoppingThinking}
              onToggleMode={handleToggleMode}
              onToggleTheme={handleToggleTheme}
              onRetry={handleRetry}
              theme={theme}
              isBackendOnline={isBackendOnline}
              onOpenSchedules={() => setIsScheduleOpen(true)}
              sceneEntryCount={sceneEntries.length}
              onOpenScene={() => {
                setScenePanelOpen(true);
                refreshRuntimePanels();
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onLogout={handleLogout}
              authLabel={authUser.display_name || authUser.username}
              selectedImage={
                selectedImage
                  ? {
                      previewUrl: selectedImage.previewUrl,
                      fileName: selectedImage.fileName,
                      isUploading: selectedImage.isUploading,
                      blipCaption: selectedImage.blipCaption,
                    }
                  : null
              }
              onSelectImage={handleSelectImage}
              onClearImage={clearSelectedImage}
              readOnlyDialogueId={selectedDialogueId}
              onExitReadOnly={handleExitStoredDialogue}
            />

            <SceneTimelinePanel
              entries={sceneEntries}
              open={scenePanelOpen && isProductRuntime}
              onClose={() => setScenePanelOpen(false)}
              theme={theme}
              initialPosition={{ left: 360, top: 112 }}
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

          <ThinkingPanel logs={thinkingLogs} isThinking={showProcessing} theme={theme} />

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
