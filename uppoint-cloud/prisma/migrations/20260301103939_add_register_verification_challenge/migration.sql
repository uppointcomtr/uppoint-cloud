-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RegistrationVerificationChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailCodeHash" TEXT NOT NULL,
    "emailCodeExpiresAt" TIMESTAMP(3) NOT NULL,
    "emailCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailCodeVerifiedAt" TIMESTAMP(3),
    "smsCodeHash" TEXT,
    "smsCodeExpiresAt" TIMESTAMP(3),
    "smsCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "smsCodeVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationVerificationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationVerificationChallenge_userId_idx" ON "RegistrationVerificationChallenge"("userId");

-- CreateIndex
CREATE INDEX "RegistrationVerificationChallenge_emailCodeExpiresAt_idx" ON "RegistrationVerificationChallenge"("emailCodeExpiresAt");

-- CreateIndex
CREATE INDEX "RegistrationVerificationChallenge_smsCodeExpiresAt_idx" ON "RegistrationVerificationChallenge"("smsCodeExpiresAt");

-- AddForeignKey
ALTER TABLE "RegistrationVerificationChallenge" ADD CONSTRAINT "RegistrationVerificationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
