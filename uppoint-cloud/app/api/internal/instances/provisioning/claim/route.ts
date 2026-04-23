import { NextResponse } from "next/server";
import { z } from "zod";

import {
  claimProvisioningJobs,
  InstanceProvisioningControlPlaneError,
} from "@/db/repositories/instance-control-plane-repository";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withRateLimitByIdentifier } from "@/lib/rate-limit";
import { enforceInternalRouteGuard } from "@/lib/security/internal-route-guard";

const claimRequestSchema = z.object({
  workerId: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  batchSize: z.coerce.number().int().min(1).max(100).default(env.KVM_WORKER_BATCH_SIZE),
  lockStaleSeconds: z.coerce.number().int().min(30).max(3600).default(env.KVM_WORKER_LOCK_STALE_SECONDS),
});

function resolveErrorStatus(code: string): number {
  switch (code) {
    case "INVALID_BODY":
      return 400;
    case "PROVISIONING_JOB_NOT_FOUND":
    case "PROVISIONING_INSTANCE_NOT_FOUND":
      return 404;
    case "INVALID_NETWORK_PREPARATION_PAYLOAD":
    case "INVALID_PROVISIONING_EVENT":
      return 400;
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
    expectedPath: "/api/internal/instances/provisioning/claim",
    tokenHeaderName: "x-internal-provisioning-token",
    expectedToken: env.INTERNAL_PROVISIONING_TOKEN ?? "",
    signingSecret: env.INTERNAL_PROVISIONING_SIGNING_SECRET ?? "",
    ipRateLimit: {
      action: "internal-instance-provisioning-claim",
      max: 240,
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
    "internal-instance-provisioning-claim-replay",
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

  let rawPayload: unknown = {};
  if (verifiedRequest.rawBody.trim().length > 0) {
    try {
      rawPayload = JSON.parse(verifiedRequest.rawBody);
    } catch {
      await logAudit("internal_provisioning_claim_failed", ip, undefined, {
        requestId: verifiedRequest.requestId,
        result: "FAILURE",
        reason: "JSON_PARSE_FAILED",
      });
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }
  }

  const parsed = claimRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    await logAudit("internal_provisioning_claim_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "SCHEMA_VALIDATION_FAILED",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const workerRateLimitResponse = await withRateLimitByIdentifier(
    "internal-instance-provisioning-claim-worker",
    parsed.data.workerId,
    300,
    60,
  );
  if (workerRateLimitResponse) {
    return workerRateLimitResponse;
  }

  try {
    const jobs = await claimProvisioningJobs(parsed.data);

    for (const job of jobs) {
      await logAudit("instance_provisioning_started", ip, job.requestedByUserId, {
        requestId: verifiedRequest.requestId,
        targetId: job.jobId,
        result: "SUCCESS",
        reason: "PROVISIONING_WORKER_CLAIMED",
        workerId: parsed.data.workerId,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        resourceGroupId: job.resourceGroupId,
        instanceId: job.instance.instanceId,
      }, job.tenantId);
    }

    return NextResponse.json(ok({
      claimed: jobs.length,
      jobs,
    }), { status: 200 });
  } catch (error) {
    const errorCode = error instanceof InstanceProvisioningControlPlaneError
      ? error.code
      : "UNKNOWN";

    await logAudit("internal_provisioning_claim_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: errorCode,
      workerId: parsed.data.workerId,
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
