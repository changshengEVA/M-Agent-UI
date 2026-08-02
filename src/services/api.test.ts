import assert from "node:assert/strict";
import test from "node:test";
import { chatApi } from "./api";

test("getTransactions consumes the neutral transaction projection", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({
        operation: "get_transactions",
        thread_id: "thread demo",
        transactions: [],
        transaction_count: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await chatApi.getTransactions("thread demo");
    assert.equal(result.operation, "get_transactions");
    assert.deepEqual(result.transactions, []);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(capturedUrl, /threads\/thread%20demo\/transactions$/);
});

test("flushBuffer exposes the neutral Runtime flush projection", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        runtime_flush: {
          flush_id: "flush-1",
          journal_status: "completed",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const result = await chatApi.flushBuffer("thread-demo");
    assert.equal(result.runtime_flush?.flush_id, "flush-1");
    assert.equal(result.runtime_flush?.journal_status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteTransaction sends revision CAS and idempotency headers", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        outcome: "deleted",
        conversation_id: "thread-demo::0",
        transaction: {
          transaction_id: "tx/one",
          thread_id: "thread demo",
          status: "cancelled",
          state: "continue",
          lifecycle_status: "deleted",
          deleted: true,
          revision: 4,
        },
        cleanup: {},
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    await chatApi.deleteTransaction("thread demo", "tx/one", 3, {
      idempotencyKey: "delete-request-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(capturedUrl, /threads\/thread%20demo\/transactions\/tx%2Fone$/);
  assert.equal(capturedInit?.method, "DELETE");
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers["If-Match"], 'W/"3"');
  assert.equal(headers["Idempotency-Key"], "delete-request-1");
});

test("deleteTransaction exposes revision conflicts from the API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: "transaction revision conflict" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => chatApi.deleteTransaction("thread-demo", "tx-1", 2),
      /\[409\] transaction revision conflict/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
