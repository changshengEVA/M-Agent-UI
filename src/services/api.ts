import {
  AuthLoginResponse,
  AuthUser,
  ChatRun,
  DialogueDetail,
  DialogueListResponse,
  ScheduleItem,
  ScheduleListResponse,
  ThreadState,
  UserConfigSchemaResponse,
} from "../types/chat";

const API_URL_STORAGE_KEY = "VITE_AGENT_API_URL";
const AUTH_TOKEN_STORAGE_KEY = "M_AGENT_AUTH_TOKEN";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(API_URL_STORAGE_KEY);
    if (saved) return saved;
  }
  return (import.meta as any).env.VITE_AGENT_API_URL || "http://127.0.0.1:8777";
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
    detail = String(payload?.error || payload?.message || detail);
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
  async healthCheck() {
    const res = await fetch(`${API_BASE}/healthz`, {
      headers: buildHeaders(),
      mode: "cors",
    });
    return parseJsonOrThrow<any>(res);
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

  async me(): Promise<{ user: AuthUser | null }> {
    const res = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<{ user: AuthUser | null }>(res);
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

  async createRun(threadId: string, message: string): Promise<ChatRun> {
    const res = await fetch(`${API_BASE}/v1/chat/runs`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ thread_id: threadId, message }),
    });
    return parseJsonOrThrow<ChatRun>(res);
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

  async getRunResult(runId: string) {
    const res = await fetch(`${API_BASE}/v1/chat/runs/${runId}`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<any>(res);
  },

  async getThreadState(threadId: string): Promise<ThreadState> {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/state`, {
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
    });
    return parseJsonOrThrow<ThreadState>(res);
  },

  async setMemoryMode(threadId: string, mode: "manual" | "off", discardPending = false) {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/mode`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ mode, discard_pending: discardPending }),
    });
    return parseJsonOrThrow<any>(res);
  },

  async flushBuffer(threadId: string, reason = "manual_api") {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/flush`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ reason }),
    });
    return parseJsonOrThrow<any>(res);
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

  async createSchedule(
    threadId: string,
    payload: {
      title: string;
      due_at: string;
      timezone_name?: string;
      prompt?: string;
      original_time_text?: string;
      source_text?: string;
      metadata?: Record<string, any>;
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

  async updateSchedule(
    threadId: string,
    scheduleId: string,
    payload: {
      title?: string;
      due_at?: string;
      timezone_name?: string;
      prompt?: string;
      original_time_text?: string;
      source_text?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<{ success: boolean; thread_id: string; item: ScheduleItem }> {
    const safeThreadId = encodeURIComponent(String(threadId || "").trim());
    const safeScheduleId = encodeURIComponent(String(scheduleId || "").trim());
    const res = await fetch(`${API_BASE}/v1/chat/threads/${safeThreadId}/schedules/${safeScheduleId}`, {
      method: "PATCH",
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
    return `${API_BASE}/v1/chat/threads/${threadId}/events?after_seq=-1`;
  },

  getSSEHeaders() {
    return {
      ...buildHeaders({ withAuth: true, withContentType: false }),
      Accept: "text/event-stream",
    };
  },
};
