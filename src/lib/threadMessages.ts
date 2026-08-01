import type { ConversationMessage, HistoryRound, ImageAttachment, Message, ThreadState } from "../types/chat";

type TurnLike = {
  img_url?: string | null;
  img_file?: string | null;
  blip_caption?: string | null;
  upload_id?: string | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
} | null | undefined;

export type TurnToAttachments = (turn?: TurnLike) => ImageAttachment[];

const messageKey = (role: string, content: string) => `${role}::${content}`;

const historyRoundsToMessages = (
  rounds: HistoryRound[],
  turnToAttachments: TurnToAttachments,
): Message[] => {
  const historyMessages: Message[] = [];
  for (const round of rounds) {
    if (round.source !== "schedule") {
      historyMessages.push({
        id: `${round.round_id}-user`,
        role: "user",
        content: round.user_message,
        timestamp: round.user_at,
        attachments: turnToAttachments(round.user_turn),
      });
    }
    historyMessages.push({
      id: `${round.round_id}-assistant`,
      role: "assistant",
      content: round.assistant_message,
      timestamp: round.assistant_at,
      attachments: turnToAttachments(round.assistant_turn),
    });
  }
  return historyMessages;
};

const conversationToMessages = (messages: ConversationMessage[]): Message[] =>
  messages.map((message) => ({
    id: message.message_id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  }));

/**
 * Build the visible transcript from thread state.
 *
 * For product runtimes (think_life / langgraph), Scene-backed
 * ``conversation_messages`` is authoritative for the live unflushed segment.
 * Preferring incomplete ``history_rounds_data`` would drop in-flight user
 * utterances (and racing replies) until the round is captured.
 */
export function messagesFromThreadState(
  state: ThreadState,
  turnToAttachments: TurnToAttachments,
  options?: { preferSceneConversation?: boolean },
): Message[] {
  const preferSceneConversation = Boolean(options?.preferSceneConversation);
  const fromHistory = historyRoundsToMessages(
    state.history_rounds_data || [],
    turnToAttachments,
  );
  const fromConversation = conversationToMessages(state.conversation_messages || []);

  if (preferSceneConversation) {
    if (fromConversation.length > 0) return fromConversation;
    return fromHistory;
  }

  if (fromHistory.length > 0) return fromHistory;
  return fromConversation;
}

/**
 * Merge a server snapshot with local optimistic / streaming bubbles so a
 * concurrent fetch cannot wipe messages that the server has not mirrored yet.
 */
export function mergeThreadMessages(
  previous: Message[],
  restored: Message[],
  options?: { preserveLocalMs?: number },
): Message[] {
  if (restored.length === 0) {
    return previous;
  }

  const preserveLocalMs = options?.preserveLocalMs ?? 120_000;
  const restoredKeys = new Set(
    restored.map((item) => messageKey(item.role, item.content)),
  );
  const now = Date.now();
  const pendingLocal = previous.filter((item) => {
    if (restoredKeys.has(messageKey(item.role, item.content))) return false;
    const age = now - new Date(item.timestamp).getTime();
    if (!Number.isFinite(age) || age > preserveLocalMs || age < 0) return false;
    if (item.role === "user") return true;
    return item.id.startsWith("assistant-stream-") || item.id.startsWith("assistant-");
  });

  if (pendingLocal.length === 0) return restored;
  return [...restored, ...pendingLocal];
}

export function upsertChatMessage(
  previous: Message[],
  next: Pick<Message, "role" | "content" | "timestamp"> & { id?: string },
): Message[] {
  const content = String(next.content || "");
  if (!content) return previous;
  const exists = previous.some(
    (item) => item.role === next.role && item.content === content,
  );
  if (exists) return previous;
  return [
    ...previous,
    {
      id: next.id || `${next.role}-${Date.now()}`,
      role: next.role,
      content,
      timestamp: next.timestamp || new Date().toISOString(),
    },
  ];
}
