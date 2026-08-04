-- Contract step of the expand/contract move. Every read and write path is now
-- keyed on the organisation, so the per-contact links can go.
--
-- THIS MIGRATION IS BREAKING. The moment it applies, any deployment still
-- running pre-contract code throws on Membership.userId. Apply it at merge to
-- main, mark the PR "Database migration required", and have other contributors
-- rebase before their previews rebuild.
--
-- MembershipDashboardMember.membershipId is dropped deliberately rather than
-- incidentally: organisationId already determines the membership 1-1, so the
-- column is derivable and can only drift. Its FK was ON DELETE SET NULL, which
-- meant a deleted membership silently nulled the link instead of failing
-- loudly. Removing it deletes that whole class of problem.

-- [data] Re-key the benefit redemption trail before the columns it was written
-- against disappear. Only the routing keys move: targetUserId, memberKey,
-- actorEmail, previous/next/added/removed, timestamp and actorId are all
-- untouched, and the original keys are stamped into data so this is reversible.
--
-- Rows whose entityId no longer matches a live User, or whose user has no
-- organisation, are deliberately left alone rather than deleted. They become
-- unreachable from the new query but remain queryable directly.
UPDATE "AuditLog" a
SET "entityType" = 'OrganisationBenefitRedemption',
    "entityId"   = u."organisationId"::text,
    "data"       = COALESCE(a."data", '{}'::jsonb)
                   || jsonb_build_object(
                        'migratedFromEntityType', 'MembershipDashboardMember',
                        'migratedFromEntityId',   a."entityId"
                      )
FROM "User" u
WHERE a."entityType" = 'MembershipDashboardMember'
  AND a."entityId"   = u."id"
  AND u."organisationId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipDashboardMember" DROP CONSTRAINT "MembershipDashboardMember_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipDashboardMember" DROP CONSTRAINT "MembershipDashboardMember_userId_fkey";

-- DropIndex
DROP INDEX "Membership_userId_idx";

-- DropIndex
DROP INDEX "MembershipDashboardMember_membershipId_idx";

-- DropIndex
DROP INDEX "MembershipDashboardMember_membershipId_key";

-- DropIndex
DROP INDEX "MembershipDashboardMember_userId_key";

-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "MembershipDashboardMember" DROP COLUMN "membershipId",
DROP COLUMN "userId";
