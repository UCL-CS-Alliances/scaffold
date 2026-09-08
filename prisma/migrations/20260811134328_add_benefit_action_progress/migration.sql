-- CreateTable
CREATE TABLE "BenefitActionProgress" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "benefitActionId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "BenefitActionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenefitActionProgress_organisationId_idx" ON "BenefitActionProgress"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitActionProgress_organisationId_benefitActionId_key" ON "BenefitActionProgress"("organisationId", "benefitActionId");

-- AddForeignKey
ALTER TABLE "BenefitActionProgress" ADD CONSTRAINT "BenefitActionProgress_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActionProgress" ADD CONSTRAINT "BenefitActionProgress_benefitActionId_fkey" FOREIGN KEY ("benefitActionId") REFERENCES "BenefitAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActionProgress" ADD CONSTRAINT "BenefitActionProgress_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
