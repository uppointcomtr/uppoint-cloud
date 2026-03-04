#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const registerPath = process.env.FINDINGS_REGISTER_PATH
  || path.join(process.cwd(), "FINDINGS_REGISTER.md");
const maxAgeDaysRaw = Number.parseInt(process.env.FINDINGS_MAX_AGE_DAYS || "30", 10);
const maxAgeDays = Number.isFinite(maxAgeDaysRaw) && maxAgeDaysRaw > 0 ? maxAgeDaysRaw : 30;

const registerSource = readFileSync(registerPath, "utf8");
const lines = registerSource.split(/\r?\n/);
const tableRows = lines.filter((line) => /^\|\s*F\d+\s*\|/.test(line));

const unresolvedStatuses = new Set(["open", "in_progress", "blocked"]);
const staleSeverities = new Set(["high", "critical"]);
const nowMs = Date.now();
const staleThresholdMs = maxAgeDays * 24 * 60 * 60 * 1000;

const unresolved = [];
const stale = [];

for (const row of tableRows) {
  const cols = row.split("|").slice(1, -1).map((part) => part.trim());
  if (cols.length < 8) {
    continue;
  }

  const [id, title, , severityRaw, , statusRaw, , lastUpdatedRaw] = cols;
  const status = statusRaw.toLowerCase();
  const severity = severityRaw.toLowerCase();

  if (unresolvedStatuses.has(status)) {
    unresolved.push({ id, title, status });
  }

  if (status !== "closed" || !staleSeverities.has(severity)) {
    continue;
  }

  const parsedMs = Date.parse(`${lastUpdatedRaw}T00:00:00Z`);
  if (!Number.isFinite(parsedMs)) {
    stale.push({
      id,
      title,
      reason: `invalid_last_updated:${lastUpdatedRaw}`,
    });
    continue;
  }

  const ageMs = nowMs - parsedMs;
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (ageMs > staleThresholdMs) {
    stale.push({
      id,
      title,
      ageDays,
      maxAgeDays,
    });
  }
}

const report = {
  registerPath,
  checkedAt: new Date().toISOString(),
  maxAgeDays,
  rowsInspected: tableRows.length,
  unresolved,
  stale,
};

if (unresolved.length === 0 && stale.length === 0) {
  console.log(`[findings-freshness] OK rows=${tableRows.length} maxAgeDays=${maxAgeDays}`);
  console.log(JSON.stringify(report));
  process.exit(0);
}

console.error("[findings-freshness] FAIL unresolved/stale findings detected");
console.error(JSON.stringify(report));
process.exit(1);
