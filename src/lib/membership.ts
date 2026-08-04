// src/lib/membership.ts
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Membership belongs to the organisation, not to the individual: a partner buys
 * a tier and its contacts occupy seats on it. The schema still hangs Membership
 * off a user, so this module is the one place that bridges the two — every read
 * resolves *user -> organisation -> the organisation's membership*, which is
 * the behaviour the rest of the app should depend on.
 *
 * The returned shape is hand-written rather than a Prisma model type, and that
 * is the point: when Membership is re-keyed to one row per organisation, only
 * the queries in this file change and no call site has to move.
 *
 * Callers inside an interactive $transaction must pass their tx — on the pooled
 * production connection (connection_limit=1) a query issued on the global
 * client queues behind the open transaction and deadlocks it. Same rule and
 * same client-first signature as recordAuditLog and uniqueOrganisationSlug.
 */
export type MembershipClient = PrismaClient | Prisma.TransactionClient;

export type OrganisationMembership = {
  membershipId: number;
  organisationId: number;
  organisationName: string;
  membershipTierId: number;
  tierKey: string;
  tierLabel: string;
  tierRank: number;
  isActive: boolean;
  status: string;
  managerName: string | null;
  expiry: Date | null;
};

export async function getMembershipForOrganisation(
  client: MembershipClient,
  organisationId: number,
): Promise<OrganisationMembership | null> {
  // Until Membership is re-keyed, one organisation can still hold several rows
  // — one per contact, and more if a member was suspended and reactivated.
  // Highest tier rank wins, ties broken by lowest id, which is the same rule
  // the backfill migration will apply when it collapses them.
  const memberships = await client.membership.findMany({
    where: { organisationId, isActive: true },
    include: { membershipTier: true, organisation: true },
  });

  if (!memberships.length) return null;

  const best = memberships.reduce((winner, current) => {
    if (current.membershipTier.rank !== winner.membershipTier.rank) {
      return current.membershipTier.rank > winner.membershipTier.rank
        ? current
        : winner;
    }
    return current.id < winner.id ? current : winner;
  }, memberships[0]);

  return {
    membershipId: best.id,
    organisationId: best.organisationId,
    organisationName: best.organisation.name,
    membershipTierId: best.membershipTierId,
    tierKey: best.membershipTier.key,
    tierLabel: best.membershipTier.label,
    tierRank: best.membershipTier.rank,
    isActive: best.isActive,
    status: best.status,
    managerName: best.managerName,
    expiry: best.expiry,
  };
}

/** A user's membership is whichever membership their organisation holds. */
export async function getMembershipForUser(
  client: MembershipClient,
  userId: string,
): Promise<OrganisationMembership | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { organisationId: true },
  });

  if (!user?.organisationId) return null;

  return getMembershipForOrganisation(client, user.organisationId);
}

/**
 * Redeemed benefit codes for an organisation. Redemption is the organisation's
 * — a partner's free workshop is consumed once, not once per contact. Until the
 * projection is re-keyed it is reached through whichever contact holds the row;
 * lowest id keeps that choice stable, and the backfill migration unions these
 * into a single row per organisation.
 */
export async function getRedeemedBenefitCodesForOrganisation(
  client: MembershipClient,
  organisationId: number,
): Promise<string[]> {
  const projection = await client.membershipDashboardMember.findFirst({
    where: { user: { organisationId } },
    orderBy: { id: "asc" },
    select: { redeemedBenefitCodes: true },
  });

  return projection?.redeemedBenefitCodes ?? [];
}
