import { ChatRun, ThreadState } from "../types/chat";

// 优先从 localStorage 读取，其次从环境变量读取，最后使用默认值
const getApiBase = () => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("VITE_AGENT_API_URL");
    if (saved) return saved;
  }
  return (import.meta as any).env.VITE_AGENT_API_URL || "https://unfriended-firefly-newton.ngrok-free.dev";
};

export let API_BASE = getApiBase();

export const updateApiBase = (newUrl: string) => {
  API_BASE = newUrl;
  localStorage.setItem("VITE_AGENT_API_URL", newUrl);
};

// 这里的 headers 包含绕过 ngrok 警告的必要字段
const getHeaders = () => ({
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true", 
});

export const chatApi = {
  async healthCheck() {
    console.log(`[API] Checking health at: ${API_BASE}/healthz`);
    try {
      const res = await fetch(`${API_BASE}/healthz`, { 
        headers: getHeaders(),
        mode: 'cors' 
      });
      const data = await res.json();
      console.log(`[API] Health check response:`, data);
      return data;
    } catch (error) {
      console.error(`[API] Health check failed:`, error);
      throw error;
    }
  },

  async createRun(threadId: string, message: string): Promise<ChatRun> {
    console.log(`[API] Creating run at: ${API_BASE}/v1/chat/runs`, { thread_id: threadId, message });
    try {
      const res = await fetch(`${API_BASE}/v1/chat/runs`, {
        method: "POST",
        headers: getHeaders(),
        mode: 'cors',
        body: JSON.stringify({ thread_id: threadId, message }),
      });
      const data = await res.json();
      console.log(`[API] Create run response:`, data);
      if (!res.ok) throw new Error(`创建会话失败: ${res.statusText}`);
      return data;
    } catch (error) {
      console.error(`[API] Create run failed:`, error);
      throw error;
    }
  },

  async getRunResult(runId: string) {
    console.log(`[API] Fetching run result for: ${runId}`);
    try {
      const res = await fetch(`${API_BASE}/v1/chat/runs/${runId}`, { 
        headers: getHeaders(),
        mode: 'cors'
      });
      const data = await res.json();
      console.log(`[API] Run result response:`, data);
      return data;
    } catch (error) {
      console.error(`[API] Fetch run result failed:`, error);
      throw error;
    }
  },

  async getThreadState(threadId: string): Promise<ThreadState> {
    console.log(`[API] Fetching thread state for: ${threadId}`);
    try {
      const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/state`, { 
        headers: getHeaders(),
        mode: 'cors'
      });
      const data = await res.json();
      console.log(`[API] Thread state response:`, data);
      if (!res.ok) throw new Error(`获取线程状态失败: ${res.statusText}`);
      return data;
    } catch (error) {
      console.error(`[API] Fetch thread state failed:`, error);
      throw error;
    }
  },

  async setMemoryMode(threadId: string, mode: "manual" | "off", discardPending = false) {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/mode`, {
      method: "POST",
      headers: getHeaders(),
      mode: 'cors',
      body: JSON.stringify({ mode, discard_pending: discardPending }),
    });
    if (!res.ok) throw new Error(`设置记忆模式失败: ${res.statusText}`);
    return res.json();
  },

  async flushBuffer(threadId: string, reason = "manual_api") {
    const res = await fetch(`${API_BASE}/v1/chat/threads/${threadId}/memory/flush`, {
      method: "POST",
      headers: getHeaders(),
      mode: 'cors',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`刷新缓存失败: ${res.statusText}`);
    return res.json();
  },

  getEventsUrl(runId: string) {
    return `${API_BASE}/v1/chat/runs/${runId}/events`;
  },

  getThreadEventsUrl(threadId: string) {
    return `${API_BASE}/v1/chat/threads/${threadId}/events?after_seq=-1`;
  }
};
