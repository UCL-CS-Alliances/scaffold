-- CreateEnum
CREATE TYPE "BenefitRequestStatus" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "BenefitRedemptionRequest" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "benefitId" INTEGER NOT NULL,
    "status" "BenefitRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT NOT NULL,
    "preferredTimeframe" TEXT,
    "contactPreference" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "BenefitRedemptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenefitRedemptionRequest_organisationId_status_idx" ON "BenefitRedemptionRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "BenefitRedemptionRequest_status_requestedAt_idx" ON "BenefitRedemptionRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "BenefitRedemptionRequest_benefitId_idx" ON "BenefitRedemptionRequest"("benefitId");

-- CreateIndex
CREATE INDEX "BenefitRedemptionRequest_requestedById_idx" ON "BenefitRedemptionRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "BenefitRedemptionRequest" ADD CONSTRAINT "BenefitRedemptionRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRedemptionRequest" ADD CONSTRAINT "BenefitRedemptionRequest_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRedemptionRequest" ADD CONSTRAINT "BenefitRedemptionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRedemptionRequest" ADD CONSTRAINT "BenefitRedemptionRequest_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
