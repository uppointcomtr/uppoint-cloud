-- CreateTable
CREATE TABLE "RevokedSessionToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedSessionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevokedSessionToken_jti_key" ON "RevokedSessionToken"("jti");

-- CreateIndex
CREATE INDEX "RevokedSessionToken_expiresAt_idx" ON "RevokedSessionToken"("expiresAt");
