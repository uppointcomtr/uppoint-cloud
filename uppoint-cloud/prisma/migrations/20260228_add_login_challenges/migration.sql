CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "loginTokenHash" TEXT,
    "loginTokenExpiresAt" TIMESTAMP(3),
    "loginTokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginChallenge_userId_idx" ON "LoginChallenge"("userId");
CREATE INDEX "LoginChallenge_mode_idx" ON "LoginChallenge"("mode");
CREATE INDEX "LoginChallenge_codeExpiresAt_idx" ON "LoginChallenge"("codeExpiresAt");
CREATE INDEX "LoginChallenge_loginTokenExpiresAt_idx" ON "LoginChallenge"("loginTokenExpiresAt");

ALTER TABLE "LoginChallenge"
ADD CONSTRAINT "LoginChallenge_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
