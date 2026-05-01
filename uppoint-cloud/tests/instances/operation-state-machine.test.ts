import { describe, expect, it } from "vitest";

import {
  assertInstanceOperationTransition,
  canTransitionInstanceOperation,
  deriveCreateOperationState,
  isTerminalInstanceOperationState,
} from "@/modules/instances/domain/operation-state-machine";

describe("instance operation state machine", () => {
  it("derives create operation state from provisioning job and event snapshots", () => {
    expect(deriveCreateOperationState({
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 5,
    })).toBe("QUEUED");

    expect(deriveCreateOperationState({
      status: "PENDING",
      attemptCount: 2,
      maxAttempts: 5,
    })).toBe("FAILED_RETRYABLE");

    expect(deriveCreateOperationState({
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 5,
      eventTypes: ["provisioning_started", "network_prepared"],
    })).toBe("PROVIDER_APPLYING");

    expect(deriveCreateOperationState({
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 5,
      eventTypes: ["provisioning_started", "network_prepared", "instance_created"],
    })).toBe("VERIFYING");

    expect(deriveCreateOperationState({
      status: "FAILED",
      attemptCount: 5,
      maxAttempts: 5,
      providerRef: "incus/vm-half-created",
    })).toBe("REPAIR_REQUIRED");
  });

  it("keeps terminal and repair transitions explicit", () => {
    expect(isTerminalInstanceOperationState("COMPLETED")).toBe(true);
    expect(isTerminalInstanceOperationState("FAILED_RETRYABLE")).toBe(false);
    expect(canTransitionInstanceOperation("VERIFYING", "COMPLETED")).toBe(true);
    expect(canTransitionInstanceOperation("COMPLETED", "QUEUED")).toBe(false);
    expect(() => assertInstanceOperationTransition("COMPLETED", "QUEUED")).toThrow(
      "INVALID_INSTANCE_OPERATION_TRANSITION:COMPLETED->QUEUED",
    );
  });
});
