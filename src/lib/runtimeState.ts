import type {
  RuntimePhase,
  ThreadRuntimeState,
  ThreadRuntimeStatus,
} from "../types/chat";

const VALID_PHASES: RuntimePhase[] = ["ready", "processing", "busy"];

/** Profiles that expose Scene and per-transaction working-memory panels. */
const PRODUCT_RUNTIME_PROFILES = new Set(["langgraph_v1"]);

/** True when the backend profile exposes the product Runtime surfaces. */
export function isProductRuntimeProfile(profile: unknown): boolean {
  const normalized = String(profile || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return (
    PRODUCT_RUNTIME_PROFILES.has(normalized) ||
    normalized.startsWith("langgraph")
  );
}

export function normalizeRuntimePhase(value: unknown): RuntimePhase {
  const phase = String(value || "")
    .trim()
    .toLowerCase();
  if (VALID_PHASES.includes(phase as RuntimePhase)) {
    return phase as RuntimePhase;
  }
  return "ready";
}

export function runtimeFromPayload(
  rt: Partial<ThreadRuntimeStatus> | Record<string, unknown>,
): ThreadRuntimeState {
  const status = rt as Partial<ThreadRuntimeStatus>;
  const pending = Number(status.pending_stimuli ?? 0);
  const busy = Boolean(status.busy);
  let phase = normalizeRuntimePhase(status.runtime_phase);
  if (!status.runtime_phase) {
    const depth =
      typeof status.effective_depth === "number"
        ? Number(status.effective_depth)
        : pending;
    if (depth <= 0) phase = "ready";
    else if (depth === 1) phase = "processing";
    else phase = "busy";
  }
  return {
    pending_stimuli: pending,
    busy,
    busy_reason: String(status.busy_reason || phase),
    runtime_profile: String(status.runtime_profile || "langgraph_v1"),
    runtime_phase: phase,
    effective_depth:
      typeof status.effective_depth === "number"
        ? Number(status.effective_depth)
        : undefined,
    in_flight_stimulus_id: status.in_flight_stimulus_id ?? null,
    preempt_enabled: Boolean(status.preempt_enabled),
  };
}

export function runtimePhaseFromState(
  runtime?: ThreadRuntimeState | null,
): RuntimePhase {
  if (runtime?.runtime_phase) {
    return normalizeRuntimePhase(runtime.runtime_phase);
  }
  if (runtime?.busy) return "busy";
  if ((runtime?.pending_stimuli ?? 0) > 0) return "busy";
  return "ready";
}

export function isRuntimeProcessing(phase: RuntimePhase): boolean {
  return phase !== "ready";
}

export function runtimePhaseLabel(phase: RuntimePhase): string {
  switch (phase) {
    case "processing":
      return "Processing";
    case "busy":
      return "Busy";
    default:
      return "Ready";
  }
}
