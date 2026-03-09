CREATE TABLE "AccountDeleteChallenge" (
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
    "deleteTokenHash" TEXT,
    "deleteTokenExpiresAt" TIMESTAMP(3),
    "deleteTokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeleteChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeleteChallenge_userId_idx"
ON "AccountDeleteChallenge"("userId");

CREATE INDEX "AccountDeleteChallenge_emailCodeExpiresAt_idx"
ON "AccountDeleteChallenge"("emailCodeExpiresAt");

CREATE INDEX "AccountDeleteChallenge_smsCodeExpiresAt_idx"
ON "AccountDeleteChallenge"("smsCodeExpiresAt");

CREATE INDEX "AccountDeleteChallenge_deleteTokenExpiresAt_idx"
ON "AccountDeleteChallenge"("deleteTokenExpiresAt");

ALTER TABLE "AccountDeleteChallenge"
ADD CONSTRAINT "AccountDeleteChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
