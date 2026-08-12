// src/lib/membership.ts
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Membership belongs to the organisation, not to the individual: a partner buys
 * a tier and its contacts occupy seats on it. Membership is one row per
 * organisation and has no userId, so a contact's membership is whatever their
 * organisationId points at. This module owns that resolution — read tier,
 * expiry, status or manager through it rather than querying prisma.membership
 * at a call site, so the rule stays in one place.
 *
 * The returned shape is hand-written rather than a Prisma model type. That kept
 * the schema move from rippling into call sites while it was underway, and it
 * still insulates them from the next one.
 *
 * Callers inside an interactive $transaction must pass their tx — on the pooled
 * production connection (connection_limit=1) a query issued on the global
 * client queues behind the open transaction and deadlocks it. Same rule and
 * same client-first signature as recordAuditLog and uniqueOrganisationSlug.
 */
export type MembershipClient = PrismaClient | Prisma.TransactionClient;

/**
 * The admin user assigned as the organisation's client experience manager.
 * Null when unassigned (or the manager's account was deleted — the FK is
 * SET NULL); consumers render the Strategic Alliances Team fallback then.
 */
export type MembershipClientExperienceManager = {
  id: string;
  name: string;
  email: string;
};

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
  /** Transitional: the free-text column the CEM relation replaces. */
  managerName: string | null;
  clientExperienceManager: MembershipClientExperienceManager | null;
  expiry: Date | null;
};

export async function getMembershipForOrganisation(
  client: MembershipClient,
  organisationId: number,
): Promise<OrganisationMembership | null> {
  const membership = await client.membership.findUnique({
    where: { organisationId },
    include: {
      membershipTier: true,
      organisation: true,
      clientExperienceManager: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!membership || !membership.isActive) return null;

  const manager = membership.clientExperienceManager;

  return {
    membershipId: membership.id,
    organisationId: membership.organisationId,
    organisationName: membership.organisation.name,
    membershipTierId: membership.membershipTierId,
    tierKey: membership.membershipTier.key,
    tierLabel: membership.membershipTier.label,
    tierRank: membership.membershipTier.rank,
    isActive: membership.isActive,
    status: membership.status,
    managerName: membership.managerName,
    clientExperienceManager: manager
      ? {
          id: manager.id,
          name: `${manager.firstName} ${manager.lastName}`,
          email: manager.email,
        }
      : null,
    expiry: membership.expiry,
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
 * — a partner's free workshop is consumed once, not once per contact.
 */
export async function getRedeemedBenefitCodesForOrganisation(
  client: MembershipClient,
  organisationId: number,
): Promise<string[]> {
  const projection = await client.membershipDashboardMember.findUnique({
    where: { organisationId },
    select: { redeemedBenefitCodes: true },
  });

  return projection?.redeemedBenefitCodes ?? [];
}
