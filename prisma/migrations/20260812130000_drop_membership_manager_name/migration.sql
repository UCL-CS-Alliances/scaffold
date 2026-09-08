-- Contract step: every consumer now reads the client experience manager
-- through the clientExperienceManagerId relation (backfilled from this column
-- in 20260812120000), so the free-text managerName can go.
--
-- THIS MIGRATION IS BREAKING. The moment it applies, any deployment still
-- running pre-contract code throws on Membership.managerName — Prisma selects
-- every scalar on a membership read. Apply it at merge to main, mark the PR
-- "Database migration required", and have other contributors rebase before
-- their previews rebuild. Before applying to the shared database, verify the
-- backfill left nothing behind:
--   SELECT "managerName" FROM "Membership"
--   WHERE "managerName" IS NOT NULL AND "clientExperienceManagerId" IS NULL;

-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "managerName";
