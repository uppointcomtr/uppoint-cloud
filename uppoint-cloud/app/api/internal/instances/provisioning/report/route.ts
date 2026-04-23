import { NextResponse } from "next/server";
import { z } from "zod";

import {
  reportProvisioningJob,
  InstanceProvisioningControlPlaneError,
} from "@/db/repositories/instance-control-plane-repository";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withRateLimitByIdentifier } from "@/lib/rate-limit";
import { enforceInternalRouteGuard } from "@/lib/security/internal-route-guard";

const networkPreparationSchema = z.object({
  vlanTag: z.coerce.number().int().min(2).max(4094),
  bridgeName: z.string().trim().min(1).max(63),
  ovsNetworkName: z.string().trim().min(1).max(63),
});

const reportRequestSchema = z.object({
  workerId: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  jobId: z.string().trim().min(1).max(191),
  eventType: z.enum([
    "network_prepared",
    "instance_created",
    "provisioning_completed",
    "provisioning_failed",
  ]),
  providerRef: z.string().trim().max(191).optional().nullable(),
  providerMessage: z.string().trim().max(500).optional().nullable(),
  errorCode: z.string().trim().max(128).optional().nullable(),
  errorMessage: z.string().trim().max(500).optional().nullable(),
  networkPreparation: networkPreparationSchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).superRefine((input, context) => {
  if (input.eventType === "network_prepared" && !input.networkPreparation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["networkPreparation"],
      message: "networkPreparation is required for network_prepared event",
    });
  }

  if (input.eventType === "provisioning_failed" && !input.errorCode && !input.errorMessage) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["errorCode"],
      message: "errorCode or errorMessage is required for provisioning_failed event",
    });
  }
});

function resolveErrorStatus(code: string): number {
  switch (code) {
    case "INVALID_BODY":
    case "INVALID_NETWORK_PREPARATION_PAYLOAD":
    case "INVALID_PROVISIONING_EVENT":
      return 400;
    case "PROVISIONING_JOB_NOT_FOUND":
    case "PROVISIONING_INSTANCE_NOT_FOUND":
      return 404;
    case "PROVISIONING_LOCK_OWNERSHIP_MISMATCH":
    case "PROVISIONING_REPORT_CONFLICT":
    case "VLAN_ALLOCATION_CONFLICT":
      return 409;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  const internalGuard = await enforceInternalRouteGuard({
    request,
    expectedPath: "/api/internal/instances/provisioning/report",
    tokenHeaderName: "x-internal-provisioning-token",
    expectedToken: env.INTERNAL_PROVISIONING_TOKEN ?? "",
    signingSecret: env.INTERNAL_PROVISIONING_SIGNING_SECRET ?? "",
    ipRateLimit: {
      action: "internal-instance-provisioning-report",
      max: 600,
      windowSeconds: 60,
    },
    unauthorizedAuditAction: "internal_provisioning_unauthorized",
  });

  if (internalGuard.blockedResponse) {
    return internalGuard.blockedResponse;
  }

  const verifiedRequest = internalGuard.verifiedRequest;
  const ip = internalGuard.ip;

  const replayRateLimitResponse = await withRateLimitByIdentifier(
    "internal-instance-provisioning-report-replay",
    verifiedRequest.requestId,
    1,
    300,
  );
  if (replayRateLimitResponse) {
    await logAudit("internal_provisioning_replay_blocked", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "REPLAY_OR_DUPLICATE_REQUEST_ID",
    });
    return replayRateLimitResponse;
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(verifiedRequest.rawBody);
  } catch {
    await logAudit("internal_provisioning_report_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "JSON_PARSE_FAILED",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const parsed = reportRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    await logAudit("internal_provisioning_report_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "SCHEMA_VALIDATION_FAILED",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const workerRateLimitResponse = await withRateLimitByIdentifier(
    "internal-instance-provisioning-report-worker",
    parsed.data.workerId,
    1200,
    60,
  );
  if (workerRateLimitResponse) {
    return workerRateLimitResponse;
  }

  try {
    const result = await reportProvisioningJob(parsed.data);

    if (parsed.data.eventType === "provisioning_completed") {
      await logAudit("instance_provisioning_completed", ip, undefined, {
        requestId: verifiedRequest.requestId,
        targetId: parsed.data.jobId,
        result: "SUCCESS",
        reason: "PROVISIONING_COMPLETED",
        workerId: parsed.data.workerId,
        providerRef: result.providerRef,
      });
    } else if (parsed.data.eventType === "provisioning_failed") {
      await logAudit("instance_provisioning_failed", ip, undefined, {
        requestId: verifiedRequest.requestId,
        targetId: parsed.data.jobId,
        result: result.terminal ? "FAILURE" : "INFO",
        reason: parsed.data.errorCode ?? "PROVISIONING_FAILED",
        workerId: parsed.data.workerId,
        terminal: result.terminal,
        retryScheduled: result.retryScheduled,
        nextAttemptAt: result.nextAttemptAt?.toISOString() ?? null,
      });
    }

    return NextResponse.json(ok(result), { status: 200 });
  } catch (error) {
    const errorCode = error instanceof InstanceProvisioningControlPlaneError
      ? error.code
      : "UNKNOWN";

    await logAudit("internal_provisioning_report_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: errorCode,
      workerId: parsed.data.workerId,
      targetId: parsed.data.jobId,
      eventType: parsed.data.eventType,
    });

    return NextResponse.json(fail(errorCode), {
      status: resolveErrorStatus(errorCode),
    });
  }
}

export async function GET() {
  return NextResponse.json(
    fail("METHOD_NOT_ALLOWED"),
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}
