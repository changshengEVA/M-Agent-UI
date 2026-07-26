import assert from "node:assert/strict";
import test from "node:test";

import type { AuthMeResponse, AuthUser } from "../types/chat";
import { resolveCanonicalThreadId } from "./canonicalThread";

const user: AuthUser = {
  username: "alice",
  display_name: "Alice",
  role: "basic",
  config_path: "alice.yaml",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

test("prefers the top-level auth/me canonical thread", () => {
  const session: AuthMeResponse = {
    user: { ...user, canonical_thread_id: "user-embedded" },
    canonical_thread_id: "server-canonical",
  };

  assert.equal(resolveCanonicalThreadId(session), "server-canonical");
});

test("accepts a canonical thread embedded in the auth user payload", () => {
  const session: AuthMeResponse = {
    user: { ...user, canonical_thread_id: " user-canonical " },
  };

  assert.equal(resolveCanonicalThreadId(session), "user-canonical");
});

test("fails closed when auth/me omits its canonical thread", () => {
  const session: AuthMeResponse = { user };

  assert.equal(resolveCanonicalThreadId(session), "");
  assert.equal(resolveCanonicalThreadId(null), "");
});
