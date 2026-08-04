-- Expand step of an expand/contract move: membership and benefit redemption
-- become properties of the organisation rather than of the individual contact.
--
-- This migration DROPS NOTHING. Membership.userId and
-- MembershipDashboardMember.userId / .membershipId all survive, so a deployment
-- running the previous code against a migrated database keeps working. The
-- destructive column drops land in a later, separate migration.
--
-- Steps marked [data] are hand-written; the DDL follows Prisma's generated
-- shape and constraint naming. Prisma applies each migration file in a single
-- transaction and PostgreSQL has transactional DDL, so a failed backfill or a
-- violated constraint rolls the whole file back and leaves the database as it
-- was.

-- AlterTable
-- Nullable to begin with, so the backfill below has somewhere to land.
ALTER TABLE "MembershipDashboardMember" ADD COLUMN "organisationId" INTEGER;

-- [data] 1. Attribute each projection row to an organisation via its contact.
UPDATE "MembershipDashboardMember" d
SET "organisationId" = u."organisationId"
FROM "User" u
WHERE d."userId" = u."id"
  AND u."organisationId" IS NOT NULL;

-- [data] 2. Fall back to the linked membership for rows whose contact link is
-- gone. MembershipDashboardMember_userId_fkey is ON DELETE SET NULL, so a row
-- can outlive the user it was attached to.
UPDATE "MembershipDashboardMember" d
SET "organisationId" = m."organisationId"
FROM "Membership" m
WHERE d."organisationId" IS NULL
  AND d."membershipId" = m."id";

-- [data] 3. Union every code held anywhere in an organisation into its
-- lowest-id row. Redemption is the organisation's, so codes ticked against
-- different contacts are the same organisation's redemptions.
WITH codes AS (
  SELECT d."organisationId" AS org_id, c AS code
  FROM "MembershipDashboardMember" d,
       LATERAL UNNEST(d."redeemedBenefitCodes") AS c
  WHERE d."organisationId" IS NOT NULL
  GROUP BY d."organisationId", c
), merged AS (
  SELECT org_id, ARRAY_AGG(code ORDER BY code) AS codes
  FROM codes
  GROUP BY org_id
), survivors AS (
  SELECT "organisationId" AS org_id, MIN("id") AS keep_id
  FROM "MembershipDashboardMember"
  WHERE "organisationId" IS NOT NULL
  GROUP BY "organisationId"
)
UPDATE "MembershipDashboardMember" d
SET "redeemedBenefitCodes" = COALESCE(m.codes, ARRAY[]::TEXT[])
FROM survivors s
LEFT JOIN merged m ON m.org_id = s.org_id
WHERE d."id" = s.keep_id;

-- [data] 4. Drop the rows that lost the union, and any row that could not be
-- attributed to an organisation at all (its codes are unreachable either way:
-- no contact and no membership points at them).
DELETE FROM "MembershipDashboardMember" d
WHERE d."organisationId" IS NULL
   OR d."id" > (
        SELECT MIN(d2."id")
        FROM "MembershipDashboardMember" d2
        WHERE d2."organisationId" = d."organisationId"
      );

-- [data] 5. memberKey becomes the organisation slug. This MUST run after step 4:
-- memberKey is unique and the rows just deleted still held their own keys.
UPDATE "MembershipDashboardMember" d
SET "memberKey" = o."slug"
FROM "Organisation" o
WHERE d."organisationId" = o."id"
  AND d."memberKey" <> o."slug";

-- [data] 6. Collapse Membership to one row per organisation.
--
-- Active rows win first, then highest tier rank, then lowest id for stability.
-- Ranking by tier alone would let an inactive Platinum row beat an active
-- Bronze one and silently deactivate the whole organisation, since every read
-- path filters on isActive.
WITH ranked AS (
  SELECT m."id",
         ROW_NUMBER() OVER (
           PARTITION BY m."organisationId"
           ORDER BY m."isActive" DESC, t."rank" DESC, m."id" ASC
         ) AS rn
  FROM "Membership" m
  JOIN "MembershipTier" t ON t."id" = m."membershipTierId"
)
DELETE FROM "Membership"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- [data] 7. Re-point the projection at the surviving membership.
-- MembershipDashboardMember_membershipId_fkey is ON DELETE SET NULL, so step 6
-- silently nulled the link rather than failing.
UPDATE "MembershipDashboardMember" d
SET "membershipId" = m."id"
FROM "Membership" m
WHERE m."organisationId" = d."organisationId"
  AND d."membershipId" IS DISTINCT FROM m."id";

-- AlterTable
ALTER TABLE "MembershipDashboardMember" ALTER COLUMN "organisationId" SET NOT NULL;

-- DropIndex
DROP INDEX "Membership_organisationId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organisationId_key" ON "Membership"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipDashboardMember_organisationId_key" ON "MembershipDashboardMember"("organisationId");

-- AddForeignKey
ALTER TABLE "MembershipDashboardMember" ADD CONSTRAINT "MembershipDashboardMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
