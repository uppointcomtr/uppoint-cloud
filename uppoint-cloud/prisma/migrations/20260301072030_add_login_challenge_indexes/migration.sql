-- DropIndex
DROP INDEX "LoginChallenge_mode_idx";

-- DropIndex
DROP INDEX "LoginChallenge_userId_idx";

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_mode_idx" ON "LoginChallenge"("userId", "mode");

-- CreateIndex
CREATE INDEX "LoginChallenge_loginTokenHash_idx" ON "LoginChallenge"("loginTokenHash");
