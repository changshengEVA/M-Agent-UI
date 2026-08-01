import {
  AuthLoginResponse,
  AuthMeResponse,
  AuthUser,
  ChatHealthResponse,
  ChatRun,
  DialogueDetail,
  DialogueListResponse,
  DialogueUploadCompletePayload,
  ImageAttachment,
  ScheduleHeartbeatResponse,
  ScheduleItem,
  ScheduleListResponse,
  SceneListResponse,
  StopThinkingResponse,
  StimulusSubmitResponse,
  ThinkLifeTransactionsResponse,
  ThinkLifeTransactionDeleteResponse,
  ThreadState,
  UploadImageResponse,
  UserConfigSchemaResponse,
} from "../types/chat";

const API_URL_STORAGE_KEY = "VITE_AGENT_API_URL";
const AUTH_TOKEN_STORAGE_KEY = "M_AGENT_AUTH_TOKEN";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(API_URL_STORAGE_KEY);
    if (saved) return saved;
  }
  return (import.meta as any).env?.VITE_AGENT_API_URL || "http://127.0.0.1:8777";
};

const getStoredAuthToken = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
};

export let API_BASE = getApiBase();
let AUTH_TOKEN = getStoredAuthToken();

export const updateApiBase = (newUrl: string) => {
  API_BASE = newUrl;
  localStorage.setItem(API_URL_STORAGE_KEY, newUrl);
};

export const setAuthToken = (token: string) => {
  AUTH_TOKEN = String(token || "").trim();
  if (AUTH_TOKEN) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, AUTH_TOKEN);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
};

export const getAuthToken = () => AUTH_TOKEN;

export const clearAuthToken = () => {
  AUTH_TOKEN = "";
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

const buildHeaders = ({
  withContentType = true,
  withAuth = false,
}: {
  withContentType?: boolean;
  withAuth?: boolean;
} = {}) => {
  const headers: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
  };
  if (withContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (withAuth && AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
};

const parseResponseError = async (res: Response) => {
  let detail = res.statusText;
  try {
    const payload = await res.json();
    const responseDetail = payload?.error || payload?.message || payload?.detail;
    detail =
      typeof responseDetail === "string"
        ? responseDetail
        : responseDetail
          ? JSON.stringify(responseDetail)
          : detail;
  } catch {
    // ignore
  }
  return new Error(`[${res.status}] ${detail}`);
};

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw await parseResponseError(res);
  }
  return (await res.json()) as T;
}

export const chatApi = {
  async healthCheck(): Promise<ChatHealthResponse> {
    const res = await fetch(`${API_BASE}/healthz`, {
      headers: buildHeaders(),
      mode: "cors",
    });
    return parseJsonOrThrow<ChatHealthResponse>(res);
  },

  async register(username: string, password: string, role: "basic" | "advanced" = "basic") {
    const res = await fetch(`${API_BASE}/v1/auth/register`, {
      method: "POST",
      headers: buildHeaders(),
      mode: "cors",
      body: JSON.stringify({ username, password, role }),
    });
    return parseJsonOrThrow<any>(res);
  },

  async login(username: string, password: string): Promise<AuthLoginResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/login`, {
      method: "POST",
      headers: buildHeaders(),
      mode: "cors",
      body: JSON.stringify({ username, password }),
    });
    const payload = await parseJsonOrThrow<AuthLoginResponse>(res);
    setAuthToken(payload.access_token);
    return payload;
  },

  async me(): Promise<AuthMeResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<AuthMeResponse>(res);
  },

  async logout() {
    const res = await fetch(`${API_BASE}/v1/auth/logout`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    clearAuthToken();
    if (!res.ok) return { success: true };
    return res.json();
  },

  async updateMyConfig(updates: {
    chat?: Record<string, any>;
    memory_agent?: Record<string, any>;
    memory_core?: Record<string, any>;
  }): Promise<{ user: AuthUser }> {
    const res = await fetch(`${API_BASE}/v1/users/me/config`, {
      method: "PATCH",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify(updates || {}),
    });
    return parseJsonOrThrow<{ user: AuthUser }>(res);
  },

  async getMyConfigSchema(): Promise<UserConfigSchemaResponse> {
    const res = await fetch(`${API_BASE}/v1/users/me/config/schema`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<UserConfigSchemaResponse>(res);
  },

  async uploadImage(threadId: string, file: File): Promise<UploadImageResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("thread_id", threadId);
    const res = await fetch(`${API_BASE}/v1/chat/uploads/images`, {
      method: "POST",
      headers: buildHeaders({ withContentType: false, withAuth: true }),
      mode: "cors",
      body: formData,
    });
    return parseJsonOrThrow<UploadImageResponse>(res);
  },

  async createRun(threadId: string, message: string, attachments?: ImageAttachment[]): Promise<ChatRun> {
    const res = await fetch(`${API_BASE}/v1/chat/runs`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ thread_id: threadId, message, attachments: attachments || [] }),
    });
    return parseJsonOrThrow<ChatRun>(res);
  },

  async submitStimulus(
    threadId: string,
    text: string,
    attachments?: ImageAttachment[],
  ): Promise<StimulusSubmitResponse> {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${encodeURIComponent(threadId)}/stimuli`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ kind: "user_message", text, attachments: attachments || [] }),
    });
    return parseJsonOrThrow<StimulusSubmitResponse>(res);
  },

  async getTransactions(
    threadId: string,
    options?: { signal?: AbortSignal },
  ): Promise<ThinkLifeTransactionsResponse> {
    const res = await fetch(
      `${API_BASE}/v1/chat/threads/${encodeURIComponent(threadId)}/transactions`,
      {
        headers: buildHeaders({ withAuth: true }),
        mode: "cors",
        signal: options?.signal,
      },
    );
    return parseJsonOrThrow<ThinkLifeTransactionsResponse>(res);
  },

  async deleteTransaction(
    threadId: string,
    transactionId: string,
    expectedRevision: number,
    options?: { idempotencyKey?: string; signal?: AbortSignal },
  ): Promise<ThinkLifeTransactionDeleteResponse> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("A valid transaction revision is required for deletion");
    }
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const safeTransactionId = encodeURIComponent(String(transactionId || "").trim());
    const idempotencyKey =
      String(options?.idempotencyKey || "").trim() ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `transaction-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const headers = buildHeaders({ withAuth: true });
    headers["If-Match"] = `W/"${expectedRevision}"`;
    headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(
      `${API_BASE}/v1/chat/threads/${safeThreadId}/transactions/${safeTransactionId}`,
      {
        method: "DELETE",
        headers,
        mode: "cors",
        signal: options?.signal,
      },
    );
    return parseJsonOrThrow<ThinkLifeTransactionDeleteResponse>(res);
  },

  async getScene(
    threadId: string,
    params?: { limit?: number; before_seq?: number; since_flush?: boolean },
  ): Promise<SceneListResponse> {
    const search = new URLSearchParams();
    if (params?.since_flush !== false) search.set("since_flush", "true");
    else search.set("since_flush", "false");
    if (typeof params?.limit === "number") search.set("limit", String(params.limit));
    if (typeof params?.before_seq === "number") search.set("before_seq", String(params.before_seq));
    const query = search.toString();
    const suffix = query ? `?${query}` : "";
    const res = await fetch(
      `${API_BASE}/v1/chat/threads/${encodeURIComponent(threadId)}/scene${suffix}`,
      {
        headers: buildHeaders({ withAuth: true }),
        mode: "cors",
      },
    );
    return parseJsonOrThrow<SceneListResponse>(res);
  },

  async listDialogues(params?: {
    thread_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<DialogueListResponse> {
    const search = new URLSearchParams();
    const threadId = String(params?.thread_id || "").trim();
    if (threadId) search.set("thread_id", threadId);
    if (typeof params?.limit === "number") search.set("limit", String(params.limit));
    if (typeof params?.offset === "number") search.set("offset", String(params.offset));
    const query = search.toString();
    const suffix = query ? `?${query}` : "";
    const res = await fetch(`${API_BASE}/v1/chat/dialogues${suffix}`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<DialogueListResponse>(res);
  },

  async getDialogue(dialogueId: string): Promise<DialogueDetail> {
    const safeId = encodeURIComponent(String(dialogueId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/dialogues/${safeId}`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<DialogueDetail>(res);
  },

  async uploadDialogues(
    files: File[],
    options?: {
      rebuildRag?: boolean;
      indexRag?: boolean;
      signal?: AbortSignal;
      onEvent?: (event: { type: string; seq?: number; payload?: Record<string, unknown> }) => void;
    },
  ): Promise<DialogueUploadCompletePayload> {
    if (!files.length) {
      throw new Error("no dialogue files selected");
    }
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file, file.name);
    }
    formData.append("rebuild_rag", options?.rebuildRag ? "true" : "false");
    formData.append("index_rag", options?.indexRag === false ? "false" : "true");

    const res = await fetch(`${API_BASE}/v1/chat/dialogues/upload`, {
      method: "POST",
      headers: buildHeaders({ withContentType: false, withAuth: true }),
      mode: "cors",
      body: formData,
      signal: options?.signal,
    });

    if (!res.ok) {
      throw await parseResponseError(res);
    }
    if (!res.body) {
      throw new Error("upload stream unavailable");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed: DialogueUploadCompletePayload | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as {
            type: string;
            seq?: number;
            payload?: Record<string, unknown>;
          };
          options?.onEvent?.(event);
          if (event.type === "upload_completed" && event.payload) {
            completed = event.payload as unknown as DialogueUploadCompletePayload;
          }
          if (event.type === "upload_failed") {
            throw new Error(String((event as any).payload?.message || "upload failed"));
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }

    if (!completed) {
      throw new Error("upload finished without completion event");
    }
    return completed;
  },

  async getRunResult(runId: string) {
    const res = await fetch(`${API_BASE}/v1/chat/runs/${runId}`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<any>(res);
  },

  async getThreadState(threadId: string): Promise<ThreadState> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/memory/state`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<ThreadState>(res);
  },

  async setMemoryMode(threadId: string, mode: "manual" | "off", discardPending = false) {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/memory/mode`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ mode, discard_pending: discardPending }),
    });
    return parseJsonOrThrow<any>(res);
  },

  async flushBuffer(threadId: string, reason = "manual_api") {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/memory/flush`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ reason }),
    });
    return parseJsonOrThrow<any>(res);
  },

  async stopThinking(threadId: string): Promise<StopThinkingResponse> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/thinking/stop`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<StopThinkingResponse>(res);
  },

  async listSchedules(
    threadId: string,
    params?: {
      include_completed?: boolean;
      limit?: number;
      keyword?: string;
      statuses?: string[];
    },
  ): Promise<ScheduleListResponse> {
    const search = new URLSearchParams();
    if (params?.include_completed) search.set("include_completed", "true");
    if (typeof params?.limit === "number") search.set("limit", String(params.limit));
    if (params?.keyword) search.set("keyword", String(params.keyword).trim());
    if (params?.statuses?.length) search.set("statuses", params.statuses.join(","));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/schedules${suffix}`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<ScheduleListResponse>(res);
  },

  async getScheduleHeartbeat(threadId: string): Promise<ScheduleHeartbeatResponse> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/schedules/heartbeat`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<ScheduleHeartbeatResponse>(res);
  },

  async createSchedule(
    threadId: string,
    payload: {
      text: string;
      due_at: string;
      timezone_name?: string;
    },
  ): Promise<{ success: boolean; thread_id: string; item: ScheduleItem }> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/schedules`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<{ success: boolean; thread_id: string; item: ScheduleItem }>(res);
  },

  async cancelSchedule(
    threadId: string,
    scheduleId: string,
  ): Promise<{ success: boolean; thread_id: string; item: ScheduleItem }> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const safeScheduleId = encodeURIComponent(String(scheduleId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/schedules/${safeScheduleId}`, {
      method: "DELETE",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<{ success: boolean; thread_id: string; item: ScheduleItem }>(res);
  },

  getEventsUrl(runId: string) {
    return `${API_BASE}/v1/chat/runs/${runId}/events`;
  },

  getThreadEventsUrl(threadId: string) {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    return `${API_BASE}/v1/chat/threads/${safeThreadId}/events?after_seq=-1`;
  },

  getImageFetchHeaders() {
    return buildHeaders({ withAuth: true, withContentType: false });
  },

  getSSEHeaders() {
    return {
      ...buildHeaders({ withAuth: true, withContentType: false }),
      Accept: "text/event-stream",
    };
  },
};
