#!/usr/bin/env node

import { createHmac } from "crypto";
import { mkdir, appendFile } from "fs/promises";
import { dirname } from "path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const AUDIT_ANCHOR_SCHEMA_VERSION = "audit-anchor/v1";
const DEFAULT_OUTPUT_PATH = "/opt/backups/audit/audit-anchor.jsonl";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function asIntegrityMetadata(value) {
  const metadata = asObject(value);
  const integrity = asObject(metadata.integrity);
  const hash = typeof integrity.hash === "string" ? integrity.hash.trim().toLowerCase() : "";
  const previousHash = typeof integrity.previousHash === "string"
    ? integrity.previousHash.trim().toLowerCase()
    : "";
  const version = typeof integrity.version === "string" ? integrity.version.trim() : "";

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return null;
  }

  return {
    hash,
    previousHash: previousHash.length > 0 ? previousHash : null,
    version: version || "unknown",
  };
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

async function main() {
  const outputPath = process.env.AUDIT_ANCHOR_OUTPUT_PATH || DEFAULT_OUTPUT_PATH;
  const signingSecret =
    process.env.AUDIT_ANCHOR_SIGNING_SECRET
    || process.env.AUDIT_LOG_SIGNING_SECRET
    || "";
  const signerKeyId = process.env.AUDIT_ANCHOR_SIGNING_KEY_ID || "audit-anchor/default";

  if (!signingSecret || signingSecret.length < 32) {
    console.error("[audit-anchor] missing or weak signing secret (set AUDIT_ANCHOR_SIGNING_SECRET)");
    process.exitCode = 1;
    return;
  }

  const chainHead = await prisma.auditLog.findFirst({
    orderBy: [{ id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      metadata: true,
    },
  });

  if (!chainHead) {
    console.log("[audit-anchor] no audit records found; skipping export");
    return;
  }

  const integrity = asIntegrityMetadata(chainHead.metadata);
  if (!integrity) {
    console.error("[audit-anchor] latest audit log record has no valid integrity hash");
    process.exitCode = 1;
    return;
  }

  const anchoredAt = new Date().toISOString();
  const payload = {
    schemaVersion: AUDIT_ANCHOR_SCHEMA_VERSION,
    anchoredAt,
    chainHead: {
      id: chainHead.id,
      createdAt: chainHead.createdAt.toISOString(),
      hash: integrity.hash,
      previousHash: integrity.previousHash,
      version: integrity.version,
    },
    source: {
      app: "cloud.uppoint.com.tr",
      host: process.env.HOSTNAME || null,
    },
    signerKeyId,
  };

  const canonical = stableStringify(payload);
  const signature = createHmac("sha256", signingSecret).update(canonical).digest("hex");
  const anchorRecord = {
    ...payload,
    signature,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await appendFile(outputPath, `${JSON.stringify(anchorRecord)}\n`, { encoding: "utf8" });

  console.log(
    `[audit-anchor] exported chainHeadId=${chainHead.id} hash=${integrity.hash} output=${outputPath}`,
  );
}

main()
  .catch((error) => {
    console.error("[audit-anchor] unexpected error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
