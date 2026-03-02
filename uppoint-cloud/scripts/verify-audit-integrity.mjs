#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const batchSize = Number.parseInt(process.env.AUDIT_INTEGRITY_BATCH_SIZE || "2000", 10);
const maxViolationSamples = Number.parseInt(process.env.AUDIT_INTEGRITY_MAX_SAMPLES || "20", 10);

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

async function main() {
  let cursorId = null;
  let inspected = 0;
  let legacySkipped = 0;
  let verified = 0;
  let startedIntegrityChain = false;
  let previousHash = null;
  const violations = [];

  while (true) {
    const page = await prisma.auditLog.findMany({
      take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 2000,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
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

      if (integrity.version !== "v1") {
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
          violations.push({
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            reason: "FIRST_CHAIN_RECORD_HAS_PREVIOUS_HASH",
          });
        }
      } else if (integrity.previousHash !== previousHash) {
        violations.push({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          reason: "CHAIN_MISMATCH",
          detail: `expected=${previousHash}, actual=${integrity.previousHash ?? "null"}`,
        });
      }

      previousHash = integrity.hash;
      verified += 1;
    }

    cursorId = page[page.length - 1]?.id ?? null;
  }

  console.log(`[audit-integrity] inspected=${inspected}`);
  console.log(`[audit-integrity] legacy_without_integrity_before_chain=${legacySkipped}`);
  console.log(`[audit-integrity] verified_chain_records=${verified}`);

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
