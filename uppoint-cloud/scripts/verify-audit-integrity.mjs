#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";

const prisma = new PrismaClient();
const batchSize = Number.parseInt(process.env.AUDIT_INTEGRITY_BATCH_SIZE || "2000", 10);
const maxViolationSamples = Number.parseInt(process.env.AUDIT_INTEGRITY_MAX_SAMPLES || "20", 10);
const AUDIT_INTEGRITY_VERSION = "v2";
const signingSecret = process.env.AUDIT_LOG_SIGNING_SECRET || "";
const legacySigningSecret = process.env.AUDIT_LOG_SIGNING_SECRET_LEGACY || "";
const strictSinceRaw = (process.env.AUDIT_INTEGRITY_CHAIN_STRICT_SINCE || "").trim();
const strictSince = strictSinceRaw ? new Date(strictSinceRaw) : null;

function asIntegrityMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const integrity = value.integrity;
  if (!integrity || typeof integrity !== "object" || Array.isArray(integrity)) {
    return null;
  }

  const hash = typeof integrity.hash === "string" ? integrity.hash.trim().toLowerCase() : "";
  const version = typeof integrity.version === "string" ? integrity.version.trim() : "";
  const previousHash = typeof integrity.previousHash === "string"
    ? integrity.previousHash.trim().toLowerCase()
    : "";

  return {
    version,
    hash,
    previousHash: previousHash.length > 0 ? previousHash : null,
  };
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function extractCanonicalMetadata(value) {
  const rest = { ...asObject(value) };
  delete rest.audit;
  delete rest.request;
  delete rest.integrity;
  return rest;
}

function normalizeForStableStringify(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalizeForStableStringify(nested)]);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalizeForStableStringify(value));
}

function computeIntegrityHash(input, secret) {
  const canonicalPayload = stableStringify({
    action: input.action,
    ip: input.ip,
    userId: input.userId ?? null,
    actorId: input.actorId ?? null,
    targetId: input.targetId ?? null,
    tenantId: input.tenantId ?? null,
    result: input.result ?? null,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    userAgent: input.userAgent ?? null,
    forwardedFor: input.forwardedFor ?? null,
    createdAt: input.createdAt,
    previousHash: input.previousHash,
    metadata: input.metadata,
    version: AUDIT_INTEGRITY_VERSION,
  });

  return createHmac("sha256", secret)
    .update(canonicalPayload)
    .digest("hex");
}

function hashesEqual(expected, actual) {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  return (
    expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function main() {
  const triggerRows = await prisma.$queryRaw`
    SELECT t.tgname AS name
    FROM pg_trigger t
    INNER JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'AuditLog'
      AND t.tgname IN ('tr_audit_log_no_update', 'tr_audit_log_no_delete')
      AND t.tgenabled = 'O'
  `;
  const enabledTriggerNames = new Set(
    Array.isArray(triggerRows)
      ? triggerRows
        .map((row) => (row && typeof row === "object" && "name" in row ? row.name : null))
        .filter((value) => typeof value === "string")
      : [],
  );

  if (!enabledTriggerNames.has("tr_audit_log_no_update") || !enabledTriggerNames.has("tr_audit_log_no_delete")) {
    console.error("[audit-integrity] FAIL immutable trigger set is incomplete on AuditLog");
    process.exitCode = 1;
    return;
  }

  let cursorId = null;
  let inspected = 0;
  let legacySkipped = 0;
  let verified = 0;
  let legacyHashVerificationSkipped = 0;
  let legacySecretVerified = 0;
  let chainBoundaryCount = 0;
  let legacyChainMismatchSkipped = 0;
  let startedIntegrityChain = false;
  let previousHash = null;
  const violations = [];

  while (true) {
    const page = await prisma.auditLog.findMany({
      take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 2000,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        action: true,
        ip: true,
        userId: true,
        actorId: true,
        targetId: true,
        tenantId: true,
        result: true,
        reason: true,
        requestId: true,
        userAgent: true,
        forwardedFor: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (page.length === 0) {
      break;
    }

    for (const row of page) {
      inspected += 1;
      const integrity = asIntegrityMetadata(row.metadata);

      if (!startedIntegrityChain) {
        if (!integrity) {
          legacySkipped += 1;
          continue;
        }
        startedIntegrityChain = true;
      }

      if (!integrity) {
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "MISSING_INTEGRITY_METADATA",
        });
        continue;
      }

      if (integrity.version !== "v1" && integrity.version !== AUDIT_INTEGRITY_VERSION) {
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "UNSUPPORTED_INTEGRITY_VERSION",
          detail: integrity.version || "empty",
        });
      }

      if (!/^[a-f0-9]{64}$/.test(integrity.hash)) {
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "INVALID_HASH_FORMAT",
        });
        continue;
      }

      if (previousHash === null) {
        if (integrity.previousHash !== null) {
          chainBoundaryCount += 1;
        }
      } else if (integrity.previousHash !== previousHash) {
        const isLegacyBeforeStrictSince = strictSince instanceof Date
          && Number.isFinite(strictSince.getTime())
          && row.createdAt.getTime() < strictSince.getTime();
        if (isLegacyBeforeStrictSince) {
          legacyChainMismatchSkipped += 1;
          previousHash = integrity.hash;
          continue;
        }
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "CHAIN_MISMATCH",
          detail: `expected=${previousHash}, actual=${integrity.previousHash ?? "null"}`,
        });
      }

      if (integrity.version === "v1") {
        legacyHashVerificationSkipped += 1;
        previousHash = integrity.hash;
        verified += 1;
        continue;
      }

      if (!signingSecret && !legacySigningSecret) {
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "MISSING_SIGNING_SECRET",
          detail: "Set AUDIT_LOG_SIGNING_SECRET (and optionally AUDIT_LOG_SIGNING_SECRET_LEGACY for historical rows)",
        });
        continue;
      }

      const canonicalMetadata = extractCanonicalMetadata(row.metadata);
      const expectedHash = signingSecret
        ? computeIntegrityHash({
          action: row.action,
          ip: row.ip ?? null,
          userId: row.userId ?? null,
          actorId: row.actorId ?? null,
          targetId: row.targetId ?? null,
          tenantId: row.tenantId ?? null,
          result: row.result ?? null,
          reason: row.reason ?? null,
          requestId: row.requestId ?? null,
          userAgent: row.userAgent ?? null,
          forwardedFor: row.forwardedFor ?? null,
          createdAt: row.createdAt.toISOString(),
          previousHash: integrity.previousHash,
          metadata: canonicalMetadata,
        }, signingSecret)
        : null;

      if (expectedHash && hashesEqual(expectedHash, integrity.hash)) {
        previousHash = integrity.hash;
        verified += 1;
        continue;
      }

      const legacyExpectedHash = legacySigningSecret
        ? computeIntegrityHash({
          action: row.action,
          ip: row.ip ?? null,
          userId: row.userId ?? null,
        actorId: row.actorId ?? null,
        targetId: row.targetId ?? null,
        tenantId: row.tenantId ?? null,
        result: row.result ?? null,
        reason: row.reason ?? null,
        requestId: row.requestId ?? null,
        userAgent: row.userAgent ?? null,
        forwardedFor: row.forwardedFor ?? null,
          createdAt: row.createdAt.toISOString(),
          previousHash: integrity.previousHash,
          metadata: canonicalMetadata,
        }, legacySigningSecret)
        : null;

      if (legacyExpectedHash && hashesEqual(legacyExpectedHash, integrity.hash)) {
        previousHash = integrity.hash;
        verified += 1;
        legacySecretVerified += 1;
        continue;
      }

      violations.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        reason: "HASH_MISMATCH",
        detail: `expected=${expectedHash ?? "n/a"}, legacy=${legacyExpectedHash ?? "n/a"}, actual=${integrity.hash}`,
      });
    }

    cursorId = page[page.length - 1]?.id ?? null;
  }

  console.log(`[audit-integrity] inspected=${inspected}`);
  console.log(`[audit-integrity] legacy_without_integrity_before_chain=${legacySkipped}`);
  console.log(`[audit-integrity] verified_chain_records=${verified}`);
  console.log(`[audit-integrity] legacy_hash_verification_skipped=${legacyHashVerificationSkipped}`);
  console.log(`[audit-integrity] legacy_secret_verified=${legacySecretVerified}`);
  console.log(`[audit-integrity] chain_boundaries=${chainBoundaryCount}`);
  console.log(`[audit-integrity] legacy_chain_mismatch_skipped=${legacyChainMismatchSkipped}`);

  if (!startedIntegrityChain) {
    console.log("[audit-integrity] no integrity-enabled audit records found yet; treating as pass");
    return;
  }

  if (violations.length > 0) {
    console.error(`[audit-integrity] FAIL violations=${violations.length}`);
    for (const violation of violations.slice(0, Number.isFinite(maxViolationSamples) ? maxViolationSamples : 20)) {
      console.error(`[audit-integrity] violation id=${violation.id} at=${violation.createdAt} reason=${violation.reason}${violation.detail ? ` detail=${violation.detail}` : ""}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("[audit-integrity] OK chain continuity verified");
}

main()
  .catch((error) => {
    console.error("[audit-integrity] FAIL unexpected error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
