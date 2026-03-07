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
const WARN_ON_LOW_NOTIFICATION_SAMPLE = (process.env.SECURITY_SLO_WARN_ON_LOW_NOTIFICATION_SAMPLE || "true")
  .toLowerCase();
const NOTIFICATION_LOCK_STALE_SECONDS = Number.parseInt(
  process.env.NOTIFICATION_OUTBOX_LOCK_STALE_SECONDS || "120",
  10,
);
const MAX_NOTIFICATION_STALE_LOCKS = Number.parseInt(
  process.env.SECURITY_SLO_MAX_NOTIFICATION_STALE_LOCKS
  || process.env.NOTIFICATION_OUTBOX_STALE_LOCK_ALERT_THRESHOLD
  || "25",
  10,
);
const MAX_AUTH_NOTIFICATION_P95_SECONDS = Number.parseFloat(
  process.env.SECURITY_SLO_MAX_AUTH_NOTIFICATION_P95_SECONDS || "20",
);
const MIN_AUTH_NOTIFICATION_SAMPLE = Number.parseInt(
  process.env.SECURITY_SLO_MIN_AUTH_NOTIFICATION_SAMPLE || "10",
  10,
);
const WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE = (process.env.SECURITY_SLO_WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE || "true")
  .toLowerCase();

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

function safePositiveNumber(input, fallback, minimum = 0) {
  if (!Number.isFinite(input) || input < minimum) {
    return fallback;
  }

  return input;
}

function isTruthy(rawValue) {
  return ["1", "true", "yes", "on"].includes(String(rawValue || "").toLowerCase());
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
  const notificationCanarySentCount = await prisma.notificationOutbox.count({
    where: {
      status: "SENT",
      updatedAt: {
        gte: since,
      },
      metadata: {
        path: ["scope"],
        equals: "ops-notification-canary",
      },
    },
  });
  const notificationCanaryFailedCount = await prisma.notificationOutbox.count({
    where: {
      status: "FAILED",
      updatedAt: {
        gte: since,
      },
      metadata: {
        path: ["scope"],
        equals: "ops-notification-canary",
      },
    },
  });
  const notificationCanaryTerminalCount = notificationCanarySentCount + notificationCanaryFailedCount;
  const terminalDeliveryCount = notificationSentCount + notificationFailedCount;
  const notificationFailureRatio = terminalDeliveryCount > 0
    ? notificationFailedCount / terminalDeliveryCount
    : 0;
  const [authLatencyRow] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::bigint AS sample_size,
      AVG(EXTRACT(EPOCH FROM ("sentAt" - "createdAt")))::double precision AS avg_seconds,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "createdAt")))::double precision AS p95_seconds
    FROM "NotificationOutbox"
    WHERE "status" = 'SENT'::"NotificationOutboxStatus"
      AND "sentAt" IS NOT NULL
      AND "updatedAt" >= ${since}
      AND COALESCE("metadata"->>'scope', '') LIKE 'auth-%'
      AND EXTRACT(EPOCH FROM ("sentAt" - "createdAt")) >= 0
  `;
  const authNotificationSampleSize = Number(authLatencyRow?.sample_size ?? 0);
  const authNotificationAvgSeconds = Number(authLatencyRow?.avg_seconds ?? 0);
  const authNotificationP95Seconds = Number(authLatencyRow?.p95_seconds ?? 0);
  const notificationStaleLockThreshold = safeInt(MAX_NOTIFICATION_STALE_LOCKS, 25, 0);
  const staleLockCutoff = new Date(Date.now() - safeInt(NOTIFICATION_LOCK_STALE_SECONDS, 120) * 1000);
  const notificationStaleLockCount = await prisma.notificationOutbox.count({
    where: {
      status: "PENDING",
      lockedAt: {
        lt: staleLockCutoff,
      },
    },
  });

  const violations = [];
  const advisories = [];
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
  if (
    terminalDeliveryCount < minNotificationTerminalSample
    && notificationCanaryTerminalCount === 0
    && isTruthy(WARN_ON_LOW_NOTIFICATION_SAMPLE)
  ) {
    advisories.push({
      type: "notification_terminal_sample_low",
      terminal: terminalDeliveryCount,
      minTerminalSample: minNotificationTerminalSample,
      canaryTerminal: notificationCanaryTerminalCount,
      note: "Failure-ratio alerting is not active until minimum terminal sample is reached and no canary terminal sample was observed.",
    });
  }
  if (notificationStaleLockCount > notificationStaleLockThreshold) {
    violations.push({
      type: "notification_stale_lock_threshold",
      staleLocks: notificationStaleLockCount,
      threshold: notificationStaleLockThreshold,
      staleSeconds: safeInt(NOTIFICATION_LOCK_STALE_SECONDS, 120),
    });
  }

  const maxAuthNotificationP95Seconds = safePositiveNumber(MAX_AUTH_NOTIFICATION_P95_SECONDS, 20, 1);
  const minAuthNotificationSample = safeInt(MIN_AUTH_NOTIFICATION_SAMPLE, 10);
  if (authNotificationSampleSize >= minAuthNotificationSample && authNotificationP95Seconds > maxAuthNotificationP95Seconds) {
    violations.push({
      type: "auth_notification_latency_p95",
      p95Seconds: Number(authNotificationP95Seconds.toFixed(2)),
      thresholdSeconds: maxAuthNotificationP95Seconds,
      sample: authNotificationSampleSize,
      averageSeconds: Number(authNotificationAvgSeconds.toFixed(2)),
    });
  }

  if (authNotificationSampleSize < minAuthNotificationSample && isTruthy(WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE)) {
    advisories.push({
      type: "auth_notification_sample_low",
      sample: authNotificationSampleSize,
      minSample: minAuthNotificationSample,
      note: "Auth notification latency SLO is advisory-only until minimum sample is reached.",
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
      canarySent: notificationCanarySentCount,
      canaryFailed: notificationCanaryFailedCount,
      canaryTerminal: notificationCanaryTerminalCount,
      staleLocks: notificationStaleLockCount,
      staleLockThreshold: notificationStaleLockThreshold,
      staleLockSeconds: safeInt(NOTIFICATION_LOCK_STALE_SECONDS, 120),
      authLatency: {
        averageSeconds: Number(authNotificationAvgSeconds.toFixed(2)),
        p95Seconds: Number(authNotificationP95Seconds.toFixed(2)),
        maxP95Seconds: maxAuthNotificationP95Seconds,
        sample: authNotificationSampleSize,
        minSample: minAuthNotificationSample,
        warnOnLowSample: isTruthy(WARN_ON_LOW_AUTH_NOTIFICATION_SAMPLE),
      },
      maxFailedAbsolute: maxNotificationFailedAbsolute,
      maxFailureRatio,
      minTerminalSample: minNotificationTerminalSample,
      warnOnLowSample: isTruthy(WARN_ON_LOW_NOTIFICATION_SAMPLE),
    },
    advisories,
    violations,
  };

  if (violations.length === 0) {
    if (advisories.length > 0) {
      console.log(`[security-slo] WARN lookback=${lookbackMinutes}m advisories=${advisories.length}`);
    } else {
      console.log(`[security-slo] OK lookback=${lookbackMinutes}m`);
    }
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
