#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOOKBACK_MINUTES = Number.parseInt(process.env.SECURITY_SLO_LOOKBACK_MINUTES || "60", 10);
const ACTION_THRESHOLDS = {
  login_otp_failed: Number.parseInt(process.env.SECURITY_SLO_MAX_LOGIN_OTP_FAILED || "120", 10),
  password_reset_failed: Number.parseInt(process.env.SECURITY_SLO_MAX_PASSWORD_RESET_FAILED || "60", 10),
  rate_limit_exceeded: Number.parseInt(process.env.SECURITY_SLO_MAX_RATE_LIMIT_EXCEEDED || "300", 10),
};
const MAX_NOTIFICATION_FAILURE_RATIO = Number.parseFloat(
  process.env.SECURITY_SLO_MAX_NOTIFICATION_DELIVERY_FAILURE_RATIO || "0.25",
);
const MAX_NOTIFICATION_FAILED_ABSOLUTE = Number.parseInt(
  process.env.SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE || "3",
  10,
);
const MIN_NOTIFICATION_TERMINAL_SAMPLE = Number.parseInt(
  process.env.SECURITY_SLO_MIN_NOTIFICATION_TERMINAL || "20",
  10,
);

const ACTIONS = Object.keys(ACTION_THRESHOLDS);

function safeInt(input, fallback, minimum = 1) {
  if (!Number.isFinite(input) || input < minimum) {
    return fallback;
  }

  return Math.trunc(input);
}

function safeRatio(input, fallback) {
  if (!Number.isFinite(input) || input < 0 || input > 1) {
    return fallback;
  }

  return input;
}

async function main() {
  const lookbackMinutes = safeInt(LOOKBACK_MINUTES, 60);
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

  const actionCounts = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  for (const row of grouped) {
    actionCounts[row.action] = row._count._all;
  }

  const notificationSentCount = await prisma.notificationOutbox.count({
    where: {
      status: "SENT",
      updatedAt: {
        gte: since,
      },
    },
  });
  const notificationFailedCount = await prisma.notificationOutbox.count({
    where: {
      status: "FAILED",
      updatedAt: {
        gte: since,
      },
    },
  });
  const terminalDeliveryCount = notificationSentCount + notificationFailedCount;
  const notificationFailureRatio = terminalDeliveryCount > 0
    ? notificationFailedCount / terminalDeliveryCount
    : 0;

  const violations = [];
  for (const action of ACTIONS) {
    const threshold = safeInt(ACTION_THRESHOLDS[action], 1);
    const count = actionCounts[action] || 0;
    if (count > threshold) {
      violations.push({
        type: "audit_action_threshold",
        action,
        count,
        threshold,
      });
    }
  }

  const maxFailureRatio = safeRatio(MAX_NOTIFICATION_FAILURE_RATIO, 0.25);
  const maxNotificationFailedAbsolute = safeInt(MAX_NOTIFICATION_FAILED_ABSOLUTE, 3);
  const minNotificationTerminalSample = safeInt(MIN_NOTIFICATION_TERMINAL_SAMPLE, 20);
  if (notificationFailedCount > maxNotificationFailedAbsolute) {
    violations.push({
      type: "notification_delivery_failed_absolute",
      failed: notificationFailedCount,
      threshold: maxNotificationFailedAbsolute,
    });
  }
  if (terminalDeliveryCount >= minNotificationTerminalSample && notificationFailureRatio > maxFailureRatio) {
    violations.push({
      type: "notification_delivery_failure_ratio",
      ratio: Number(notificationFailureRatio.toFixed(4)),
      threshold: maxFailureRatio,
      minTerminalSample: minNotificationTerminalSample,
      sent: notificationSentCount,
      failed: notificationFailedCount,
    });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    lookbackMinutes,
    since: since.toISOString(),
    actionCounts,
    actionThresholds: Object.fromEntries(
      ACTIONS.map((action) => [action, safeInt(ACTION_THRESHOLDS[action], 1)]),
    ),
    notification: {
      sent: notificationSentCount,
      failed: notificationFailedCount,
      terminal: terminalDeliveryCount,
      failureRatio: Number(notificationFailureRatio.toFixed(4)),
      maxFailedAbsolute: maxNotificationFailedAbsolute,
      maxFailureRatio,
      minTerminalSample: minNotificationTerminalSample,
    },
    violations,
  };

  if (violations.length === 0) {
    console.log(`[security-slo] OK lookback=${lookbackMinutes}m`);
    console.log(JSON.stringify(report));
    return;
  }

  console.error(`[security-slo] ALERT lookback=${lookbackMinutes}m violations=${violations.length}`);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[security-slo] FAIL unexpected error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
