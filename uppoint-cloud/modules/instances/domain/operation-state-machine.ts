export const INSTANCE_OPERATION_TYPES = [
  "CREATE",
  "REINSTALL",
  "DELETE",
  "POWER_ON",
  "POWER_OFF",
  "REBOOT",
  "RESIZE",
] as const;

export type InstanceOperationType = (typeof INSTANCE_OPERATION_TYPES)[number];

export const INSTANCE_OPERATION_STATES = [
  "QUEUED",
  "CLAIMED",
  "NETWORK_PREPARING",
  "PROVIDER_APPLYING",
  "VERIFYING",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
  "CANCELLED",
  "REPAIR_REQUIRED",
] as const;

export type InstanceOperationState = (typeof INSTANCE_OPERATION_STATES)[number];

export interface InstanceCreateOperationSnapshot {
  status: "PENDING" | "RUNNING" | "FAILED" | "COMPLETED" | "CANCELLED";
  attemptCount: number;
  maxAttempts: number;
  providerRef?: string | null;
  eventTypes?: readonly string[];
}

const TERMINAL_OPERATION_STATES = new Set<InstanceOperationState>([
  "COMPLETED",
  "FAILED_TERMINAL",
  "CANCELLED",
]);

const ALLOWED_OPERATION_TRANSITIONS: Record<InstanceOperationState, readonly InstanceOperationState[]> = {
  QUEUED: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["NETWORK_PREPARING", "PROVIDER_APPLYING", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED"],
  NETWORK_PREPARING: ["PROVIDER_APPLYING", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED"],
  PROVIDER_APPLYING: ["VERIFYING", "FAILED_RETRYABLE", "FAILED_TERMINAL", "REPAIR_REQUIRED", "CANCELLED"],
  VERIFYING: ["COMPLETED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "REPAIR_REQUIRED"],
  COMPLETED: [],
  FAILED_RETRYABLE: ["QUEUED", "CLAIMED", "FAILED_TERMINAL", "CANCELLED"],
  FAILED_TERMINAL: ["REPAIR_REQUIRED"],
  CANCELLED: [],
  REPAIR_REQUIRED: ["QUEUED", "FAILED_TERMINAL", "CANCELLED"],
};

export function isTerminalInstanceOperationState(state: InstanceOperationState): boolean {
  return TERMINAL_OPERATION_STATES.has(state);
}

export function canTransitionInstanceOperation(
  from: InstanceOperationState,
  to: InstanceOperationState,
): boolean {
  return ALLOWED_OPERATION_TRANSITIONS[from].includes(to);
}

export function assertInstanceOperationTransition(
  from: InstanceOperationState,
  to: InstanceOperationState,
): void {
  if (!canTransitionInstanceOperation(from, to)) {
    throw new Error(`INVALID_INSTANCE_OPERATION_TRANSITION:${from}->${to}`);
  }
}

export function deriveCreateOperationState(
  snapshot: InstanceCreateOperationSnapshot,
): InstanceOperationState {
  const eventTypes = new Set(snapshot.eventTypes ?? []);

  if (snapshot.status === "COMPLETED") {
    return "COMPLETED";
  }

  if (snapshot.status === "CANCELLED") {
    return "CANCELLED";
  }

  if (snapshot.status === "FAILED") {
    return snapshot.providerRef ? "REPAIR_REQUIRED" : "FAILED_TERMINAL";
  }

  if (snapshot.status === "PENDING") {
    return snapshot.attemptCount > 0 ? "FAILED_RETRYABLE" : "QUEUED";
  }

  if (eventTypes.has("instance_created")) {
    return "VERIFYING";
  }

  if (eventTypes.has("network_prepared")) {
    return "PROVIDER_APPLYING";
  }

  return "CLAIMED";
}
