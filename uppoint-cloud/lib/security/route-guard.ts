import "server-only";

import type { AuditAction } from "@/lib/audit-log";
import { logAudit } from "@/lib/audit-log";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";

interface FailClosedIpRateLimitInput {
  rateLimitAction: string;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  auditActionName: string;
  auditScope: string;
  userId?: string;
  auditMetadata?: Record<string, unknown>;
}

interface FailClosedIdentifierRateLimitInput {
  rateLimitAction: string;
  identifier: string | null | undefined;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  auditActionName: string;
  auditScope: string;
  ip: string;
  userId?: string;
  auditMetadata?: Record<string, unknown>;
}

export interface FailClosedIpRateLimitResult {
  ip: string;
  blockedResponse: Response | null;
}

export async function enforceFailClosedIpRateLimit(
  input: FailClosedIpRateLimitInput,
): Promise<FailClosedIpRateLimitResult> {
  const blockedResponse = await withRateLimit(
    input.rateLimitAction,
    input.rateLimitMax,
    input.rateLimitWindowSeconds,
  );
  const ip = await getClientIp();

  if (blockedResponse) {
    await logAudit("rate_limit_exceeded", ip, input.userId, {
      action: input.auditActionName,
      scope: input.auditScope,
      ...(input.auditMetadata ?? {}),
    });
  }

  return { ip, blockedResponse };
}

export async function enforceFailClosedIdentifierRateLimit(
  input: FailClosedIdentifierRateLimitInput,
): Promise<Response | null> {
  const normalizedIdentifier = input.identifier?.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const blockedResponse = await withRateLimitByIdentifier(
    input.rateLimitAction,
    normalizedIdentifier,
    input.rateLimitMax,
    input.rateLimitWindowSeconds,
  );

  if (blockedResponse) {
    await logAudit("rate_limit_exceeded", input.ip, input.userId, {
      action: input.auditActionName,
      scope: input.auditScope,
      ...(input.auditMetadata ?? {}),
    });
  }

  return blockedResponse;
}

export async function auditGuardFailure(
  action: AuditAction,
  ip: string,
  metadata: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  await logAudit(action, ip, userId, {
    result: "FAILURE",
    ...metadata,
  });
}
