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
  user_id?: string | null;
  events_url: string;
  result_url: string;
}

export interface AuthUser {
  username: string;
  display_name: string;
  role: "basic" | "advanced";
  config_path: string;
  created_at: string;
  updated_at: string;
  editable_fields?: Record<string, string[]>;
}

export interface AuthLoginResponse {
  user: AuthUser;
  access_token: string;
  token_type: "bearer";
  expires_at: string;
}

export type UserConfigSectionKey = "chat" | "memory_agent" | "memory_core";

export interface UserConfigFieldSchema {
  type: string;
  description: string;
  editable: boolean;
  present: boolean;
  current_value: any;
}

export interface UserConfigSectionSchema {
  editable_fields: string[];
  patch_example: Record<string, any>;
  fields: Record<string, UserConfigFieldSchema>;
}

export interface UserConfigSchemaResponse {
  user: {
    username: string;
    role: "basic" | "advanced";
    config_path: string;
  };
  sections: Record<UserConfigSectionKey, UserConfigSectionSchema>;
}

export interface DialogueSummary {
  dialogue_id: string;
  thread_id: string;
  start_time: string | null;
  end_time: string | null;
  source?: string | null;
  round_count: number;
  turn_count: number;
  preview?: string;
  dialogue_file?: string;
}

export interface DialogueListResponse {
  items: DialogueSummary[];
  offset: number;
  limit: number;
  next_offset: number | null;
  has_more: boolean;
  total: number;
}

export interface DialogueTurn {
  turn_id: number;
  speaker: string;
  text: string;
  timestamp: string | null;
}

export interface DialogueDetail {
  dialogue_id: string;
  thread_id: string;
  thread_id_internal?: string | null;
  user_id?: string | null;
  participants: string[];
  meta: Record<string, any>;
  turns: DialogueTurn[];
  round_count: number;
  turn_count: number;
  dialogue_file?: string;
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

export type ScheduleStatus = "pending" | "leased" | "running" | "done" | "failed" | "canceled";

export interface ScheduleItem {
  schedule_id: string;
  owner_id: string;
  thread_id: string;
  title: string;
  status: ScheduleStatus;
  due_at_utc: string;
  due_at_local: string;
  due_display: string;
  timezone_name: string;
  original_time_text: string;
  action_type: string;
  action_payload: Record<string, any>;
  created_at: string;
  updated_at: string;
  source_text: string;
  metadata: Record<string, any>;
}

export interface ScheduleListResponse {
  thread_id: string;
  scope?: "owner" | "thread";
  owner_id: string;
  count: number;
  include_completed: boolean;
  keyword: string;
  statuses: string[];
  items: ScheduleItem[];
}
