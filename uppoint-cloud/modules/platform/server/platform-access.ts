import "server-only";

import { notFound } from "next/navigation";

import { findPlatformUserAccessSnapshot } from "@/db/repositories/platform-operations-repository";
import {
  assertPlatformAccess,
  type PlatformPermission,
  type PlatformRole,
} from "@/modules/auth/server/platform-rbac";

export async function requirePlatformAccess(input: {
  userId: string;
  permission: PlatformPermission;
}): Promise<{ role: PlatformRole }> {
  const user = await findPlatformUserAccessSnapshot({ userId: input.userId });
  const role = user?.platformRole ?? null;

  if (!role) {
    notFound();
  }

  try {
    assertPlatformAccess({
      role,
      permission: input.permission,
    });
  } catch {
    notFound();
  }

  return {
    role,
  };
}
