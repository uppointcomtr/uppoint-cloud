#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOOKBACK_MINUTES = Number.parseInt(process.env.AUTH_ABUSE_LOOKBACK_MINUTES || "15", 10);
const ACTION_THRESHOLDS = {
  rate_limit_exceeded: Number.parseInt(process.env.AUTH_ABUSE_THRESHOLD_RATE_LIMIT_EXCEEDED || "60", 10),
  login_otp_failed: Number.parseInt(process.env.AUTH_ABUSE_THRESHOLD_LOGIN_OTP_FAILED || "30", 10),
  login_challenge_start_failed: Number.parseInt(process.env.AUTH_ABUSE_THRESHOLD_LOGIN_CHALLENGE_START_FAILED || "30", 10),
  password_reset_failed: Number.parseInt(process.env.AUTH_ABUSE_THRESHOLD_PASSWORD_RESET_FAILED || "20", 10),
};

const ACTIONS = Object.keys(ACTION_THRESHOLDS);

function safeInt(input, fallback) {
  if (!Number.isFinite(input) || input <= 0) {
    return fallback;
  }

  return Math.trunc(input);
}

async function main() {
  const lookbackMinutes = safeInt(LOOKBACK_MINUTES, 15);
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const grouped = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      createdAt: {
        gte: since,
      },
      action: {
        in: ACTIONS,
      },
    },
    _count: {
      _all: true,
    },
  });

  const counts = Object.fromEntries(
    ACTIONS.map((action) => [action, 0]),
  );
  for (const row of grouped) {
    counts[row.action] = row._count._all;
  }

  const violations = ACTIONS
    .map((action) => ({
      action,
      count: counts[action] || 0,
      threshold: safeInt(ACTION_THRESHOLDS[action], 1),
    }))
    .filter((item) => item.count >= item.threshold);

  const report = {
    checkedAt: new Date().toISOString(),
    lookbackMinutes,
    since: since.toISOString(),
    counts,
    thresholds: Object.fromEntries(
      ACTIONS.map((action) => [action, safeInt(ACTION_THRESHOLDS[action], 1)]),
    ),
    violations,
  };

  if (violations.length === 0) {
    console.log(`[auth-abuse-check] OK lookback=${lookbackMinutes}m`);
    console.log(JSON.stringify(report));
    return;
  }

  console.error(`[auth-abuse-check] ALERT lookback=${lookbackMinutes}m violations=${violations.length}`);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[auth-abuse-check] FAIL unexpected error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
