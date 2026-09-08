-- CreateTable
CREATE TABLE "Benefit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tierMinId" INTEGER NOT NULL,
    "trigger" TEXT,
    "outcome" TEXT,
    "terms" TEXT[],
    "supersedesCodes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitAction" (
    "id" SERIAL NOT NULL,
    "benefitId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "BenefitAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitPartnerNote" (
    "id" SERIAL NOT NULL,
    "benefitId" INTEGER NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitPartnerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Benefit_code_key" ON "Benefit"("code");

-- CreateIndex
CREATE INDEX "Benefit_tierMinId_idx" ON "Benefit"("tierMinId");

-- CreateIndex
CREATE INDEX "BenefitAction_benefitId_position_idx" ON "BenefitAction"("benefitId", "position");

-- CreateIndex
CREATE INDEX "BenefitPartnerNote_organisationId_idx" ON "BenefitPartnerNote"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitPartnerNote_benefitId_organisationId_key" ON "BenefitPartnerNote"("benefitId", "organisationId");

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_tierMinId_fkey" FOREIGN KEY ("tierMinId") REFERENCES "MembershipTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAction" ADD CONSTRAINT "BenefitAction_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitPartnerNote" ADD CONSTRAINT "BenefitPartnerNote_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitPartnerNote" ADD CONSTRAINT "BenefitPartnerNote_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
