import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductRuntimeProfile,
  isRuntimeProcessing,
  runtimeFromPayload,
  runtimePhaseFromState,
} from "./runtimeState";

test("product Runtime detection accepts the current engine profile", () => {
  assert.equal(isProductRuntimeProfile("langgraph_v1"), true);
  assert.equal(isProductRuntimeProfile("langgraph_next"), true);
  assert.equal(isProductRuntimeProfile("legacy"), false);
});

test("runtime payloads populate neutral thread state", () => {
  const runtime = runtimeFromPayload({
    pending_stimuli: 2,
    busy: true,
    busy_reason: "queue",
    runtime_profile: "langgraph_v1",
    effective_depth: 2,
  });

  assert.equal(runtime.runtime_profile, "langgraph_v1");
  assert.equal(runtime.pending_stimuli, 2);
  assert.equal(runtimePhaseFromState(runtime), "busy");
  assert.equal(isRuntimeProcessing(runtimePhaseFromState(runtime)), true);
});
