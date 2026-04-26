import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  createSafePathSegment,
  InstanceIsoUploadError,
  prepareIsoUploadDescriptor,
  resolveIsoUploadTarget,
  writeIsoUploadStream,
} from "@/modules/instances/server/iso-upload-service";
import { assertInstanceTenantAccess } from "@/modules/instances/server/security-boundary";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uploadHeaderSchema = z.object({
  tenantId: z.string().trim().min(1).max(191),
  originalFileName: z.string().trim().min(1).max(180),
});

function decodeHeaderValue(value: string | null): string {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDeclaredSize(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new InstanceIsoUploadError("VALIDATION_FAILED", "Invalid content length", 400);
  }

  return Number(normalized);
}

function resolveUploadError(error: unknown): { code: string; status: number } {
  if (error instanceof z.ZodError) {
    return { code: "VALIDATION_FAILED", status: 400 };
  }

  if (error instanceof InstanceIsoUploadError) {
    return { code: error.code, status: error.status };
  }

  if (error instanceof Error) {
    if (error.message === "TENANT_ACCESS_DENIED") {
      return { code: "TENANT_ACCESS_DENIED", status: 403 };
    }

    if (error.message === "TENANT_ROLE_INSUFFICIENT") {
      return { code: "TENANT_ROLE_INSUFFICIENT", status: 403 };
    }
  }

  return { code: "ISO_UPLOAD_FAILED", status: 500 };
}

export async function POST(request: Request) {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "instance-iso-upload",
    rateLimitMax: 20,
    rateLimitWindowSeconds: 3600,
    auditActionName: "instance-iso-upload",
    auditScope: "ip",
  });
  if (ipGuard.blockedResponse) {
    return ipGuard.blockedResponse;
  }
  const ip = ipGuard.ip;

  const session = await auth();
  if (!session?.user?.id) {
    await logAudit("instance_iso_upload_failed", ip, undefined, {
      reason: "UNAUTHORIZED",
      result: "FAILURE",
    });
    return NextResponse.json(fail("UNAUTHORIZED"), { status: 401 });
  }

  const userRateLimit = await enforceFailClosedIdentifierRateLimit({
    rateLimitAction: "instance-iso-upload-user",
    identifier: session.user.id,
    rateLimitMax: 10,
    rateLimitWindowSeconds: 3600,
    auditActionName: "instance-iso-upload",
    auditScope: "user",
    ip,
    userId: session.user.id,
  });
  if (userRateLimit) {
    return userRateLimit;
  }

  let tenantId: string | undefined;

  try {
    const headers = uploadHeaderSchema.parse({
      tenantId: request.headers.get("x-tenant-id"),
      originalFileName: decodeHeaderValue(request.headers.get("x-file-name")),
    });
    tenantId = headers.tenantId;

    await resolveUserTenantContext({
      userId: session.user.id,
      tenantId: headers.tenantId,
      minimumRole: TenantRole.ADMIN,
    });

    await assertInstanceTenantAccess({
      tenantId: headers.tenantId,
      userId: session.user.id,
      minimumRole: TenantRole.ADMIN,
    });

    const descriptor = prepareIsoUploadDescriptor({
      originalFileName: headers.originalFileName,
      contentType: request.headers.get("content-type"),
      declaredSizeBytes: parseDeclaredSize(request.headers.get("content-length")),
      maxSizeBytes: env.INSTANCE_ISO_UPLOAD_MAX_BYTES,
    });
    const target = resolveIsoUploadTarget({
      rootDirectory: env.INSTANCE_ISO_UPLOAD_DIR,
      pathSegment: createSafePathSegment(headers.tenantId),
      storedFileName: descriptor.storedFileName,
    });
    const written = await writeIsoUploadStream({
      body: request.body,
      target,
      maxSizeBytes: env.INSTANCE_ISO_UPLOAD_MAX_BYTES,
    });

    await logAudit("instance_iso_upload_completed", ip, session.user.id, {
      targetId: descriptor.storedFileName,
      tenantId: headers.tenantId,
      sourceFile: descriptor.originalFileName,
      storedFile: descriptor.storedFileName,
      sizeBytes: written.sizeBytes,
      result: "SUCCESS",
    }, headers.tenantId);

    return NextResponse.json(ok({
      originalFileName: descriptor.originalFileName,
      storedFileName: descriptor.storedFileName,
      sizeBytes: written.sizeBytes,
      storagePath: target.finalPath,
    }), { status: 201 });
  } catch (error) {
    const resolved = resolveUploadError(error);

    await logAudit("instance_iso_upload_failed", ip, session.user.id, {
      tenantId,
      reason: resolved.code,
      result: "FAILURE",
    }, tenantId);

    if (resolved.status >= 500) {
      logServerError("instance_iso_upload_failed", error, {
        route: "/api/instances/iso-images",
        userId: session.user.id,
        tenantId,
      });
    }

    return NextResponse.json(fail(resolved.code), { status: resolved.status });
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
