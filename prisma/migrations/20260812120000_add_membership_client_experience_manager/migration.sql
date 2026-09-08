-- Adds Membership.clientExperienceManagerId, a nullable FK to User replacing
-- the free-text managerName (dropped in a later contract migration once every
-- consumer reads the relation). SET NULL: the membership survives its
-- manager's account deletion.

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "clientExperienceManagerId" TEXT;

-- CreateIndex
CREATE INDEX "Membership_clientExperienceManagerId_idx" ON "Membership"("clientExperienceManagerId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientExperienceManagerId_fkey" FOREIGN KEY ("clientExperienceManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from the free-text managerName. Matching rule, in order:
--   1. the known SAT manager names from src/content/contactRouting.ts, mapped
--      to their emails and matched against admin users' emails — names are the
--      display strings admins actually typed, but emails are the stable
--      identity;
--   2. exact (case/whitespace-insensitive) full-name match against an admin
--      user's firstName + lastName.
-- Only users holding the ADMIN role qualify. "Strategic Alliances Team" and
-- anything unmatched deliberately stay NULL — a NULL manager renders as the
-- SAT team everywhere. managerName itself is kept until the contract
-- migration, so nothing is lost if a value fails to match. DISTINCT ON makes
-- two admins sharing a full name resolve deterministically (lowest id wins).
-- No-ops on a fresh database.
UPDATE "Membership" m
SET "clientExperienceManagerId" = a."userId"
FROM (
  SELECT DISTINCT ON (lower(btrim(u."firstName" || ' ' || u."lastName")))
         lower(btrim(u."firstName" || ' ' || u."lastName")) AS full_name,
         lower(u."email") AS email,
         u."id" AS "userId"
  FROM "User" u
  JOIN "UserRole" ur ON ur."userId" = u."id"
  JOIN "Role" r ON r."id" = ur."roleId" AND r."key" = 'ADMIN'
  ORDER BY lower(btrim(u."firstName" || ' ' || u."lastName")), u."id"
) a
WHERE m."managerName" IS NOT NULL
  AND (
    a.email = CASE lower(btrim(m."managerName"))
      WHEN 'daniel hajas'      THEN 'd.hajas@ucl.ac.uk'
      WHEN 'danielle garratt'  THEN 'daniellegarratt2304@hotmail.co.uk'
      WHEN 'tim bodley-scott'  THEN 't.bodley-scott@ucl.ac.uk'
      WHEN 'marco piccionello' THEN 'm.piccionello@ucl.ac.uk'
      WHEN 'mehran allybaccus' THEN 'm.allybaccus@ucl.ac.uk'
      ELSE NULL
    END
    OR a.full_name = lower(btrim(m."managerName"))
  );
