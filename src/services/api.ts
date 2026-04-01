import { AuthLoginResponse, AuthUser, ChatRun, ThreadState } from "../types/chat";

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

  async createRun(threadId: string, message: string): Promise<ChatRun> {
    const res = await fetch(`${API_BASE}/v1/chat/runs`, {
      method: "POST",
      headers: buildHeaders({ withAuth: true }),
      mode: "cors",
      body: JSON.stringify({ thread_id: threadId, message }),
    });
    return parseJsonOrThrow<ChatRun>(res);
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
