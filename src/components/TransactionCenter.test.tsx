import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ThinkLifeTransaction } from "../types/chat";
import { TransactionCenter, TransactionDangerZone } from "./TransactionCenter";

const transaction = (
  id: string,
  overrides: Partial<ThinkLifeTransaction> = {},
): ThinkLifeTransaction => ({
  transaction_id: id,
  thread_id: "thread-demo",
  status: "running",
  state: "continue",
  lifecycle_status: "active",
  pause_reason: null,
  kind: "user_task",
  priority: 50,
  wm_entries: [],
  wm_entry_count: 0,
  task_state: {
    goal: `Goal ${id}`,
    completion_status: "processing",
    completed: [],
    remaining: [],
  },
  think_rounds: 0,
  delegate_count: 0,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  is_active_user: false,
  is_cpu_holder: false,
  ...overrides,
});

test("uses canonical state for the default Open filter", () => {
  const html = renderToStaticMarkup(
    <TransactionCenter
      transactions={[
        transaction("canonical-open", { status: "completed", state: "continue" }),
        transaction("canonical-pause", { status: "running", state: "pause" }),
      ]}
      activeTransactionId={null}
      cpuTransactionId={null}
      runtimeProfile="think_life_v1"
      theme="dark"
    />,
  );

  assert.match(html, /Goal canonical-open/);
  assert.doesNotMatch(html, /Goal canonical-pause/);
  assert.match(html, /continue/);
});

test("keeps active-user and CPU authority separate when CPU is explicitly idle", () => {
  const html = renderToStaticMarkup(
    <TransactionCenter
      transactions={[
        transaction("stale-row-cpu", {
          is_cpu_holder: true,
          updated_at: "2026-08-01T02:00:00Z",
        }),
        transaction("active-user", {
          is_active_user: true,
          updated_at: "2026-08-01T01:00:00Z",
        }),
      ]}
      activeTransactionId="active-user"
      cpuTransactionId={null}
      runtimeProfile="think_life_v1"
      theme="dark"
    />,
  );

  assert.ok(html.indexOf("Goal active-user") < html.indexOf("Goal stale-row-cpu"));
  assert.match(html, /CPU idle/);
  assert.doesNotMatch(html, />CPU</);
});

test("renders legacy thread WM in the same sidebar surface", () => {
  const html = renderToStaticMarkup(
    <TransactionCenter
      transactions={[]}
      runtimeProfile="legacy"
      legacyWorkingMemory={{
        enabled: true,
        stored_entries: 1,
        entries: [{ fact: "legacy memory" }],
      }}
      theme="light"
    />,
  );

  assert.match(html, /Thread WM · Legacy/);
  assert.match(html, /legacy memory/);
  assert.doesNotMatch(html, /No transactions yet/);
});

test("renders an explicit irreversible confirmation before transaction deletion", () => {
  const html = renderToStaticMarkup(
    <TransactionDangerZone
      transaction={transaction("delete-me", { revision: 7 })}
      theme="dark"
      confirmOpen
      onRequestDelete={() => undefined}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />,
  );

  assert.match(html, /Danger Zone/);
  assert.match(html, /cannot be undone or restored/i);
  assert.match(html, /external effects will remain/i);
  assert.match(html, /Delete permanently/);
  assert.match(html, /Cancel/);
});

test("shows an audit tombstone instead of delete controls after deletion", () => {
  const html = renderToStaticMarkup(
    <TransactionDangerZone
      transaction={transaction("deleted", {
        revision: 8,
        lifecycle_status: "deleted",
        deleted: true,
        deleted_at: "2026-08-01T01:00:00Z",
      })}
      theme="light"
      confirmOpen={false}
      result={{
        success: true,
        outcome: "deleted",
        cleanup: { cancelled_runs: 2 },
      }}
      onRequestDelete={() => undefined}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />,
  );

  assert.match(html, /audit tombstone retained/i);
  assert.match(html, /cannot be restored/i);
  assert.match(html, /Cancelled Runs/);
  assert.doesNotMatch(html, /Delete permanently/);
});
