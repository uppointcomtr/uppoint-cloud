-- Additive platform RBAC persistence for operator/admin surfaces.
CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT', 'SECURITY', 'PLATFORM_ADMIN');

ALTER TABLE "User"
  ADD COLUMN "platformRole" "PlatformRole";

CREATE INDEX "User_platformRole_idx" ON "User"("platformRole");
