import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryWindow } from "./HistoryWindow";

test("previews a current round without replacing the live chat", () => {
  let opened = false;
  const html = renderToStaticMarkup(
    <HistoryWindow
      open
      onClose={() => undefined}
      theme="dark"
      selectedRoundId="round-1"
      currentRounds={[
        {
          round_id: "round-1",
          capture_state: "written",
          flush_id: "flush-1",
          source: "user",
          user_message: "Current user message",
          assistant_message: "Current assistant reply",
          user_at: "2026-08-01T00:00:00Z",
          assistant_at: "2026-08-01T00:00:01Z",
        },
      ]}
      dialogues={[]}
      onOpenDialogue={() => {
        opened = true;
      }}
    />,
  );

  assert.match(html, /Current user message/);
  assert.match(html, /Current assistant reply/);
  assert.equal(opened, false);
});

test("renders an explicitly selected stored dialogue transcript", () => {
  const dialogue = {
    dialogue_id: "dialogue-1",
    thread_id: "thread-1",
    start_time: "2026-08-01T00:00:00Z",
    end_time: "2026-08-01T00:00:01Z",
    round_count: 1,
    turn_count: 2,
    preview: "Stored preview",
  };
  const html = renderToStaticMarkup(
    <HistoryWindow
      open
      initialTab="stored"
      onClose={() => undefined}
      theme="light"
      currentRounds={[]}
      dialogues={[dialogue]}
      selectedDialogueId="dialogue-1"
      dialogueDetail={{
        dialogue_id: "dialogue-1",
        thread_id: "thread-1",
        participants: ["User", "Assistant"],
        meta: {},
        round_count: 1,
        turn_count: 2,
        turns: [
          { turn_id: 1, speaker: "User", text: "Stored question", timestamp: null },
          { turn_id: 2, speaker: "Assistant", text: "Stored answer", timestamp: null },
        ],
      }}
      onOpenDialogue={() => undefined}
    />,
  );

  assert.match(html, /Stored question/);
  assert.match(html, /Stored answer/);
  assert.match(html, /Open in Chat/);
});
