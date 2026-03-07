import "server-only";

import { createHash, createHmac, randomUUID } from "crypto";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export type AuditAction =
  | "register_success"
  | "register_verified"
  | "register_verification_restarted"
  | "register_verification_failed"
  | "login_challenge_started"
  | "login_challenge_verified"
  | "login_success"
  | "login_otp_failed"
  | "login_challenge_start_failed"
  | "logout_success"
  | "rate_limit_exceeded"
  | "password_reset_requested"
  | "password_reset_success"
  | "password_reset_failed"
  | "password_changed"
  | "session_revoked"
  | "email_verified"
  | "email_verification_failed"
  | "edge_host_rejected"
  | "edge_origin_rejected"
  | "internal_dispatch_success"
  | "internal_dispatch_failed"
  | "internal_dispatch_replay_blocked"
  | "internal_dispatch_unauthorized"
  | "notification_delivery_terminal_failed"
  | "internal_audit_security_event_unauthorized"
  | "internal_audit_security_event_replay_blocked"
  | "internal_audit_security_event_invalid_body"
  | "deprecated_endpoint_access"
  | "tenant_access_denied"
  | "tenant_role_insufficient"
  | "tenant_context_missing"
  | "user_soft_deleted";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie|email|phone|name|fullName|firstName|lastName|address)/i;
// Match plaintext secrets that may appear as values (bearer tokens, JWT prefix, raw passwords).
const SENSITIVE_VALUE_PATTERN = /(password=|bearer\s|eyj[a-z0-9]|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const SECURITY_SIGNAL_ACTIONS = new Set<AuditAction>([
  "rate_limit_exceeded",
  "login_otp_failed",
  "login_challenge_start_failed",
  "password_reset_failed",
  "session_revoked",
  "edge_host_rejected",
  "edge_origin_rejected",
  "internal_dispatch_failed",
  "internal_dispatch_replay_blocked",
  "internal_dispatch_unauthorized",
  "notification_delivery_terminal_failed",
  "internal_audit_security_event_unauthorized",
  "internal_audit_security_event_replay_blocked",
  "internal_audit_security_event_invalid_body",
  "deprecated_endpoint_access",
  "tenant_access_denied",
  "tenant_role_insufficient",
]);
const AUDIT_FALLBACK_LOG_PATH = env.AUDIT_FALLBACK_LOG_PATH || "/var/log/uppoint-cloud/audit-fallback.log";
const AUDIT_FALLBACK_CHAIN_STATE_PATH =
  env.AUDIT_FALLBACK_CHAIN_STATE_PATH || "/var/lib/uppoint-cloud/audit-fallback-chain.state";
const AUDIT_INTEGRITY_VERSION = "v2";
const AUDIT_INTEGRITY_SECRET = env.AUDIT_LOG_SIGNING_SECRET ?? "dev-only-audit-signing-secret-change-me";
const AUDIT_CHAIN_LOCK_KEY_ONE = 2_147_483_647;
const AUDIT_CHAIN_LOCK_KEY_TWO = 4_242;

let auditFallbackPathChecked = false;
let auditFallbackPathReady = false;
let auditFallbackChainStatePathChecked = false;
let auditFallbackChainStatePathReady = false;

interface AuditRequestContext {
  requestId: string;
  userAgent: string | null;
  ip: string | null;
  forwardedFor: string | null;
}

interface AuditEnvelopeMetadata {
  schemaVersion: "audit/v1";
  action: AuditAction;
  result: string;
  reason: string | null;
  requestId: string;
}

interface AuditIntegrityMetadata {
  version: string;
  previousHash: string | null;
  hash: string;
}

type AuditStoredMetadata = Record<string, unknown> & {
  audit: AuditEnvelopeMetadata;
  request: AuditRequestContext;
  integrity: AuditIntegrityMetadata;
};

interface AuditFallbackIntegrityMetadata {
  version: "fallback/v1";
  timestamp: string;
  previousHash: string | null;
  hash: string;
  signature: string;
}

async function ensureAuditFallbackPath(): Promise<boolean> {
  if (auditFallbackPathChecked) {
    return auditFallbackPathReady;
  }

  auditFallbackPathChecked = true;

  try {
    await mkdir(dirname(AUDIT_FALLBACK_LOG_PATH), { recursive: true });
    auditFallbackPathReady = true;
  } catch {
    auditFallbackPathReady = false;
  }

  return auditFallbackPathReady;
}

async function ensureAuditFallbackChainStatePath(): Promise<boolean> {
  if (auditFallbackChainStatePathChecked) {
    return auditFallbackChainStatePathReady;
  }

  auditFallbackChainStatePathChecked = true;

  try {
    await mkdir(dirname(AUDIT_FALLBACK_CHAIN_STATE_PATH), { recursive: true });
    auditFallbackChainStatePathReady = true;
  } catch {
    auditFallbackChainStatePathReady = false;
  }

  return auditFallbackChainStatePathReady;
}

async function readAuditFallbackPreviousHash(): Promise<string | null> {
  if (!(await ensureAuditFallbackChainStatePath())) {
    return readAuditFallbackPreviousHashFromLog();
  }

  try {
    const raw = await readFile(AUDIT_FALLBACK_CHAIN_STATE_PATH, { encoding: "utf8" });
    const value = raw.trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(value)) {
      return value;
    }
  } catch {
    // fall through to log-based recovery
  }

  return readAuditFallbackPreviousHashFromLog();
}

async function writeAuditFallbackPreviousHash(hash: string): Promise<void> {
  if (!(await ensureAuditFallbackChainStatePath())) {
    return;
  }

  try {
    await writeFile(
      AUDIT_FALLBACK_CHAIN_STATE_PATH,
      `${hash}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // Do not throw from audit fallback state sink.
  }
}

async function readAuditFallbackPreviousHashFromLog(): Promise<string | null> {
  if (!(await ensureAuditFallbackPath())) {
    return null;
  }

  try {
    const raw = await readFile(AUDIT_FALLBACK_LOG_PATH, { encoding: "utf8" });
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const fallbackIntegrity = parsed.fallbackIntegrity;
        if (!fallbackIntegrity || typeof fallbackIntegrity !== "object") {
          continue;
        }

        const hash = (fallbackIntegrity as Record<string, unknown>).hash;
        if (typeof hash !== "string") {
          continue;
        }

        const normalized = hash.trim().toLowerCase();
        if (/^[a-f0-9]{64}$/.test(normalized)) {
          return normalized;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function buildAuditFallbackIntegrityMetadata(
  payload: Record<string, unknown>,
  previousHash: string | null,
): AuditFallbackIntegrityMetadata {
  const timestamp = new Date().toISOString();
  const canonicalPayload = stableStringify({
    payload,
    previousHash,
    timestamp,
  });
  const hash = createHash("sha256").update(canonicalPayload).digest("hex");
  const signature = createHmac("sha256", AUDIT_INTEGRITY_SECRET)
    .update(`${timestamp}\n${hash}`)
    .digest("hex");

  return {
    version: "fallback/v1",
    timestamp,
    previousHash,
    hash,
    signature,
  };
}

async function writeAuditFallbackLine(payload: Record<string, unknown>): Promise<void> {
  if (!(await ensureAuditFallbackPath())) {
    return;
  }

  try {
    const previousHash = await readAuditFallbackPreviousHash();
    const fallbackIntegrity = buildAuditFallbackIntegrityMetadata(payload, previousHash);
    const fallbackLinePayload: Record<string, unknown> = {
      ...payload,
      fallbackIntegrity,
    };

    await appendFile(
      AUDIT_FALLBACK_LOG_PATH,
      `${JSON.stringify(fallbackLinePayload)}\n`,
      { encoding: "utf8" },
    );
    await writeAuditFallbackPreviousHash(fallbackIntegrity.hash);
  } catch {
    // Do not throw from audit fallback sink.
  }
}

function redactSensitiveMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }

    output[key] = redactSensitiveValue(value);
  }

  return output;
}

function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return SENSITIVE_VALUE_PATTERN.test(value) ? "[REDACTED]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry));
  }

  if (typeof value === "object" && value !== null) {
    return redactSensitiveMetadata(value as Record<string, unknown>);
  }

  return value;
}

async function resolveRequestAuditContext(): Promise<AuditRequestContext> {
  try {
    const headersList = await headers();
    const requestId = headersList.get("x-request-id")?.trim() || randomUUID();
    const userAgent = headersList.get("user-agent");
    const realIp = headersList.get("x-real-ip")?.trim() ?? null;
    const forwardedFor = headersList.get("x-forwarded-for");

    const resolvedIp = resolveTrustedClientIp({
      realIpHeader: realIp,
      forwardedForHeader: forwardedFor,
      isProduction: env.NODE_ENV === "production",
    });

    return {
      requestId,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      ip: resolvedIp,
      forwardedFor: forwardedFor ? forwardedFor.slice(0, 255) : null,
    };
  } catch {
    return {
      requestId: randomUUID(),
      userAgent: null,
      ip: null,
      forwardedFor: null,
    };
  }
}

function pickString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
}

function resolveStoredIp(inputIp: string, requestContextIp: string | null): string | null {
  const explicitIp = pickString(inputIp);
  if (explicitIp && explicitIp !== "unknown") {
    return explicitIp;
  }

  return pickString(requestContextIp) ?? null;
}

function resolveAuditResult(action: AuditAction, metadata?: Record<string, unknown>): string {
  const explicitResult = pickString(metadata?.result);
  if (explicitResult) {
    return explicitResult.toUpperCase();
  }

  const normalizedAction = action.toLowerCase();
  if (normalizedAction.includes("failed") || normalizedAction.includes("exceeded")) {
    return "FAILURE";
  }
  if (normalizedAction.includes("success") || normalizedAction.includes("verified")) {
    return "SUCCESS";
  }
  return "INFO";
}

function emitSecuritySignal(input: {
  action: AuditAction;
  result: string;
  requestId?: string;
  userId?: string;
  targetId?: string;
  reason?: string;
}): void {
  const shouldEmit =
    SECURITY_SIGNAL_ACTIONS.has(input.action)
    || input.result === "FAILURE";

  if (!shouldEmit) {
    return;
  }

  const signal = {
    type: "security_signal",
    action: input.action,
    result: input.result,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    targetId: input.targetId ?? null,
    reason: input.reason ?? null,
    at: new Date().toISOString(),
  };

  console.warn("[security-signal]", JSON.stringify(signal));
}

function pickIntegrityHash(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const integrity = (metadata as Record<string, unknown>).integrity;
  if (!integrity || typeof integrity !== "object" || Array.isArray(integrity)) {
    return null;
  }

  const hash = (integrity as Record<string, unknown>).hash;
  if (typeof hash !== "string") {
    return null;
  }

  const normalized = hash.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalizeForStableStringify(nested)] as const);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

function computeIntegrityHash(input: {
  action: AuditAction;
  ip: string | null;
  userId?: string;
  actorId?: string;
  targetId?: string;
  tenantId?: string;
  result: string;
  reason?: string;
  requestId?: string;
  userAgent?: string;
  forwardedFor?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  previousHash: string | null;
}): string {
  const canonicalPayload = stableStringify({
    action: input.action,
    ip: input.ip,
    userId: input.userId ?? null,
    actorId: input.actorId ?? null,
    targetId: input.targetId ?? null,
    tenantId: input.tenantId ?? null,
    result: input.result,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    userAgent: input.userAgent ?? null,
    forwardedFor: input.forwardedFor ?? null,
    createdAt: input.createdAt.toISOString(),
    previousHash: input.previousHash,
    metadata: input.metadata,
    version: AUDIT_INTEGRITY_VERSION,
  });

  return createHmac("sha256", AUDIT_INTEGRITY_SECRET)
    .update(canonicalPayload)
    .digest("hex");
}

/**
 * Records a security-relevant event for forensic analysis.
 * Never throws to callers; DB errors are captured via fallback sink.
 */
export async function logAudit(
  action: AuditAction,
  ip: string,
  userId?: string,
  metadata?: Record<string, unknown>,
  tenantId?: string,
): Promise<void> {
  const requestContext = await resolveRequestAuditContext();
  const safeMetadata = metadata ? redactSensitiveMetadata(metadata) : {};
  const result = resolveAuditResult(action, safeMetadata);
  const reason = pickString(safeMetadata.reason);
  const actorId = pickString(safeMetadata.actorId);
  const targetId = pickString(safeMetadata.targetId) ?? pickString(safeMetadata.targetUserId);
  const resolvedTenantId = pickString(tenantId) ?? pickString(safeMetadata.tenantId);
  const requestId = pickString(requestContext.requestId) ?? randomUUID();
  const userAgent = pickString(requestContext.userAgent);
  const forwardedFor = pickString(requestContext.forwardedFor);
  const storedIp = resolveStoredIp(ip, requestContext.ip);

  try {
    await prisma.$transaction(async (tx) => {
      // Security-sensitive: serialize integrity-chain writes to prevent concurrent hash-branching.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          CAST(${AUDIT_CHAIN_LOCK_KEY_ONE} AS integer),
          CAST(${AUDIT_CHAIN_LOCK_KEY_TWO} AS integer)
        )
      `;

      const previous = await tx.auditLog.findFirst({
        orderBy: [
          { id: "desc" },
        ],
        select: {
          metadata: true,
        },
      });
      const previousIntegrityHash = pickIntegrityHash(previous?.metadata) ?? null;
      const createdAt = new Date();
      const integrityHash = computeIntegrityHash({
        action,
        ip: storedIp,
        userId,
        actorId,
        targetId,
        tenantId: resolvedTenantId,
        result,
        reason,
        requestId,
        userAgent,
        forwardedFor,
        metadata: safeMetadata,
        createdAt,
        previousHash: previousIntegrityHash,
      });

      const composedMetadata: AuditStoredMetadata = {
        ...safeMetadata,
        audit: {
          schemaVersion: "audit/v1",
          action,
          result,
          reason: reason ?? null,
          requestId,
        },
        request: requestContext,
        integrity: {
          version: AUDIT_INTEGRITY_VERSION,
          previousHash: previousIntegrityHash,
          hash: integrityHash,
        },
      };

      await tx.auditLog.create({
        data: {
          action,
          ip: storedIp,
          userId: userId ?? undefined,
          actorId,
          targetId,
          tenantId: resolvedTenantId,
          result,
          reason,
          requestId,
          userAgent,
          forwardedFor,
          createdAt,
          metadata: composedMetadata as Prisma.InputJsonValue,
        },
      });
    });

    emitSecuritySignal({
      action,
      result,
      requestId,
      userId: userId ?? undefined,
      targetId,
      reason,
    });
  } catch (error) {
    const fallbackPayload = {
      type: "audit_fallback",
      action,
      userId: userId ?? null,
      metadata: metadata ? redactSensitiveMetadata(metadata) : {},
      error: error instanceof Error ? error.message : "unknown",
      at: new Date().toISOString(),
    };
    await writeAuditFallbackLine(fallbackPayload);
    console.error("[audit-fallback]", JSON.stringify(fallbackPayload));
    console.error("[audit] Failed to write audit log:", action, error);
  }
}
