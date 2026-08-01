import assert from "node:assert/strict";
import test from "node:test";

import type { ThreadState } from "../types/chat";
import {
  mergeThreadMessages,
  messagesFromThreadState,
  upsertChatMessage,
} from "./threadMessages";

const emptyAttachments = () => [];

const baseState = (overrides: Partial<ThreadState> = {}): ThreadState => ({
  thread_id: "t1",
  mode: "manual",
  history_rounds: 1,
  history_messages: 2,
  pending_rounds: 1,
  pending_turns: 2,
  has_pending_data: true,
  last_activity_at: null,
  last_flush_at: null,
  idle_flush_seconds: 60,
  idle_flush_deadline: null,
  ...overrides,
});

test("prefers scene conversation over incomplete history for product runtimes", () => {
  const state = baseState({
    history_rounds_data: [
      {
        round_id: "r1",
        capture_state: "pending",
        flush_id: null,
        user_message: "old",
        assistant_message: "old reply",
        user_at: "2026-07-30T10:00:00Z",
        assistant_at: "2026-07-30T10:00:01Z",
      },
    ],
    conversation_messages: [
      {
        message_id: "scene-1",
        role: "user",
        content: "old",
        timestamp: "2026-07-30T10:00:00Z",
      },
      {
        message_id: "scene-2",
        role: "assistant",
        content: "old reply",
        timestamp: "2026-07-30T10:00:01Z",
      },
      {
        message_id: "scene-3",
        role: "user",
        content: "晚上好",
        timestamp: "2026-07-30T11:54:07Z",
      },
    ],
  });

  const messages = messagesFromThreadState(state, emptyAttachments, {
    preferSceneConversation: true,
  });
  assert.deepEqual(
    messages.map((item) => item.content),
    ["old", "old reply", "晚上好"],
  );
});

test("keeps optimistic user bubbles missing from a stale server snapshot", () => {
  const previous = [
    {
      id: "1",
      role: "user" as const,
      content: "old",
      timestamp: new Date().toISOString(),
    },
    {
      id: "2",
      role: "user" as const,
      content: "晚上好",
      timestamp: new Date().toISOString(),
    },
  ];
  const restored = [
    {
      id: "r1-user",
      role: "user" as const,
      content: "old",
      timestamp: "2026-07-30T10:00:00Z",
    },
  ];
  const merged = mergeThreadMessages(previous, restored);
  assert.deepEqual(
    merged.map((item) => item.content),
    ["old", "晚上好"],
  );
});

test("dedupes identical role/content pairs", () => {
  const first = upsertChatMessage([], {
    role: "assistant",
    content: "hello",
    timestamp: "2026-07-30T11:54:15Z",
  });
  const second = upsertChatMessage(first, {
    role: "assistant",
    content: "hello",
    timestamp: "2026-07-30T11:54:16Z",
  });
  assert.equal(second.length, 1);
});
