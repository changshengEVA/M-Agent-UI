import { ThreadRuntimeStatus, ThreadThinkLifeState } from "../types/chat";

export type ThinkLifeRuntimePhase = "ready" | "processing" | "busy";

const VALID_PHASES: ThinkLifeRuntimePhase[] = ["ready", "processing", "busy"];

export function normalizeRuntimePhase(value: unknown): ThinkLifeRuntimePhase {
  const phase = String(value || "")
    .trim()
    .toLowerCase();
  if (VALID_PHASES.includes(phase as ThinkLifeRuntimePhase)) {
    return phase as ThinkLifeRuntimePhase;
  }
  return "ready";
}

export function thinkLifeFromRuntimePayload(
  rt: Partial<ThreadRuntimeStatus> | Record<string, unknown>,
): ThreadThinkLifeState {
  const pending = Number((rt as ThreadRuntimeStatus).pending_stimuli ?? 0);
  const busy = Boolean((rt as ThreadRuntimeStatus).busy);
  let phase = normalizeRuntimePhase((rt as ThreadRuntimeStatus).runtime_phase);
  if (!(rt as ThreadRuntimeStatus).runtime_phase) {
    const depth =
      typeof (rt as ThreadRuntimeStatus).effective_depth === "number"
        ? Number((rt as ThreadRuntimeStatus).effective_depth)
        : pending;
    if (depth <= 0) phase = "ready";
    else if (depth === 1) phase = "processing";
    else phase = "busy";
  }
  return {
    pending_stimuli: pending,
    busy,
    busy_reason: String((rt as ThreadRuntimeStatus).busy_reason || phase),
    runtime_profile: String((rt as ThreadRuntimeStatus).runtime_profile || "think_life"),
    runtime_phase: phase,
    effective_depth:
      typeof (rt as ThreadRuntimeStatus).effective_depth === "number"
        ? Number((rt as ThreadRuntimeStatus).effective_depth)
        : undefined,
    in_flight_stimulus_id:
      (rt as ThreadRuntimeStatus).in_flight_stimulus_id ?? null,
    preempt_enabled: Boolean((rt as ThreadRuntimeStatus).preempt_enabled),
  };
}

export function thinkLifePhaseFromState(
  tl?: ThreadThinkLifeState | null,
): ThinkLifeRuntimePhase {
  if (tl?.runtime_phase) return normalizeRuntimePhase(tl.runtime_phase);
  if (tl?.busy) return "busy";
  if ((tl?.pending_stimuli ?? 0) > 0) return "busy";
  return "ready";
}

export function isThinkLifeProcessing(phase: ThinkLifeRuntimePhase): boolean {
  return phase !== "ready";
}

export function thinkLifePhaseLabel(phase: ThinkLifeRuntimePhase): string {
  switch (phase) {
    case "processing":
      return "Processing";
    case "busy":
      return "Busy";
    default:
      return "Ready";
  }
}
