import type { AuthMeResponse } from "../types/chat";

function normalizedThreadId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve only the account-owned canonical id returned by `/v1/auth/me` (or the
 * equivalent login response). Health reports the base runtime and is not a
 * safe fallback for an authenticated user.
 */
export function resolveCanonicalThreadId(
  session: AuthMeResponse | null | undefined,
): string {
  return (
    normalizedThreadId(session?.canonical_thread_id) ||
    normalizedThreadId(session?.user?.canonical_thread_id)
  );
}
