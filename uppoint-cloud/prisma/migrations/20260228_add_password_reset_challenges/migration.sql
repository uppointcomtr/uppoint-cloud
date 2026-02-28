CREATE TABLE "PasswordResetChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailCodeHash" TEXT NOT NULL,
    "emailCodeVerifiedAt" TIMESTAMP(3),
    "emailCodeExpiresAt" TIMESTAMP(3) NOT NULL,
    "emailCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "smsCodeHash" TEXT,
    "smsCodeVerifiedAt" TIMESTAMP(3),
    "smsCodeExpiresAt" TIMESTAMP(3),
    "smsCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "resetTokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetChallenge_userId_idx" ON "PasswordResetChallenge"("userId");
CREATE INDEX "PasswordResetChallenge_emailCodeExpiresAt_idx" ON "PasswordResetChallenge"("emailCodeExpiresAt");
CREATE INDEX "PasswordResetChallenge_smsCodeExpiresAt_idx" ON "PasswordResetChallenge"("smsCodeExpiresAt");
CREATE INDEX "PasswordResetChallenge_resetTokenExpiresAt_idx" ON "PasswordResetChallenge"("resetTokenExpiresAt");

ALTER TABLE "PasswordResetChallenge"
ADD CONSTRAINT "PasswordResetChallenge_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
