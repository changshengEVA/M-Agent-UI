export type MemoryMode = "manual" | "off";

export interface ThreadState {
  thread_id: string;
  mode: MemoryMode;
  history_rounds: number;
  history_messages: number;
  pending_rounds: number;
  pending_turns: number;
  has_pending_data: boolean;
  last_activity_at: string | null;
  last_flush_at: string | null;
  idle_flush_seconds: number;
  idle_flush_deadline: string | null;
  history_rounds_data?: HistoryRound[];
  history_preview?: HistoryRound[];
}

export interface HistoryRound {
  round_id: string;
  capture_state: "pending" | "written" | "skipped";
  flush_id: string | null;
  user_message: string;
  assistant_message: string;
  user_at: string;
  assistant_at: string;
}

export interface ChatRun {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  thread_id: string;
  events_url: string;
  result_url: string;
}

export interface ChatEvent {
  run_id: string;
  seq: number;
  type: string;
  payload: any;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  status?: "sending" | "sent" | "error";
}

export interface ThinkingLog {
  id: string;
  type: string;
  message: string;
  data?: any;
  timestamp: number;
}
