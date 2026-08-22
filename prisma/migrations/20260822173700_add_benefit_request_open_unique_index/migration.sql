-- "At most one open request per organisation per benefit" as a real database
-- constraint.
--
-- Prisma cannot express a partial unique index, so this index is hand-written
-- and absent from schema.prisma. A plain unique constraint on
-- ("organisationId", "benefitId") would be wrong: a benefit can legitimately
-- be requested again after an admin reset, so only *open* requests are unique
-- — CLOSED rows accumulate as history.
--
-- Verified on Prisma 6.19.3: this does NOT cause migration drift.
-- `prisma migrate dev --create-only` against a database carrying this index
-- produces an empty migration — Prisma's differ ignores partial indexes rather
-- than trying to drop the ones it cannot represent. Re-check after a major
-- Prisma upgrade; if a future version does emit a spurious
-- `DROP INDEX "BenefitRedemptionRequest_open_per_org_benefit_key"`, delete
-- that line from the generated migration.
--
-- It is isolated in its own migration so the whole constraint can be abandoned
-- cheaply if that ever changes. Application-level enforcement in
-- requestBenefitRedemptionAction (which checks for an existing open request in
-- the same transaction) is the primary guard either way; this index only
-- closes the gap left by concurrent submissions, and the action maps its P2002
-- to an "already requested" result.
CREATE UNIQUE INDEX "BenefitRedemptionRequest_open_per_org_benefit_key"
  ON "BenefitRedemptionRequest" ("organisationId", "benefitId")
  WHERE "status" IN ('REQUESTED', 'ACKNOWLEDGED', 'IN_PROGRESS');
