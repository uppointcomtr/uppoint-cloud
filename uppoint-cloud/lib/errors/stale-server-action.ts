const STALE_SERVER_ACTION_MARKER = "Failed to find Server Action";

export function isStaleServerActionError(error: Error | null | undefined): boolean {
  if (!error || typeof error.message !== "string") {
    return false;
  }

  return error.message.includes(STALE_SERVER_ACTION_MARKER);
}
