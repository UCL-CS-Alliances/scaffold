-- Two fields that only start to matter once an organisation can have more than
-- one contact: a job title to tell colleagues apart, and a flag for which of
-- them speaks for the organisation.
--
-- Purely additive. Both columns have defaults or are nullable, so a deployment
-- running the previous code against a migrated database is unaffected.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jobTitle" TEXT;

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- [data] A contact who is the only person at their organisation is
-- unambiguously its primary contact. Organisations with several contacts are
-- left without one until an admin chooses, rather than guessing.
UPDATE "User" u
SET "isPrimaryContact" = true
WHERE u."organisationId" IS NOT NULL
  AND (
    SELECT COUNT(*) FROM "User" u2 WHERE u2."organisationId" = u."organisationId"
  ) = 1;
