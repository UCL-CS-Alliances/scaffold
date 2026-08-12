// src/lib/membership-dashboard.ts
import { prisma } from "@/lib/prisma";
import {
  getMembershipForOrganisation,
  getRedeemedBenefitCodesForOrganisation,
} from "@/lib/membership";

export type AdminTierSummary = {
  id: number;
  key: string;
  label: string;
  rank: number;
  count: number;
};

export type AdminDashboardSummary = {
  // Member *organisations*, not contacts: a partner with three people on the
  // platform is one member of the programme.
  totalMemberOrganisations: number;
  tiers: AdminTierSummary[];
};

export type MemberDashboardData = {
  firstName: string;
  organisationName: string | null;

  // Membership info
  membershipTierLabel: string;
  membershipTierKey: string | null;
  membershipTierRank: number | null;
  membershipExpiry: Date | null;
  membershipManagerName: string | null;

  // Dashboard-specific data
  redeemedBenefitCodes: string[];
};

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const memberRole = await prisma.role.findUnique({
    where: { key: "MEMBER" },
  });

  const [tiers, memberships] = await Promise.all([
    prisma.membershipTier.findMany({
      orderBy: { rank: "asc" },
      select: { id: true, key: true, label: true, rank: true },
    }),
    // Qualified by the organisation having at least one MEMBER contact.
    // Filtering through the membership's own user is no longer possible, and
    // was wrong anyway: after the collapse that column held whichever contact
    // happened to win, so an organisation could drop out of every total purely
    // because that person lacked the MEMBER role.
    prisma.membership.findMany({
      where: {
        isActive: true,
        organisation: memberRole
          ? { users: { some: { roles: { some: { roleId: memberRole.id } } } } }
          : undefined,
      },
      select: {
        organisationId: true,
        membershipTierId: true,
      },
    }),
  ]);

  // One membership row per organisation now, so the row count is the
  // organisation count and no per-organisation deduplication is needed.
  const countByTierId = new Map<number, number>();
  for (const m of memberships) {
    countByTierId.set(
      m.membershipTierId,
      (countByTierId.get(m.membershipTierId) ?? 0) + 1,
    );
  }

  const tierSummaries: AdminTierSummary[] = tiers.map((tier) => ({
    id: tier.id,
    key: tier.key,
    label: tier.label,
    rank: tier.rank,
    count: countByTierId.get(tier.id) ?? 0,
  }));

  return {
    totalMemberOrganisations: memberships.length,
    tiers: tierSummaries,
  };
}

export async function getMemberDashboardData(
  userId: string,
): Promise<MemberDashboardData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      organisationId: true,
      organisation: { select: { name: true } },
    },
  });

  if (!user) return null;

  // Tier and redemption both belong to the organisation, so every contact at
  // one partner sees the same dashboard.
  const [membership, redeemedBenefitCodes] = user.organisationId
    ? await Promise.all([
        getMembershipForOrganisation(prisma, user.organisationId),
        getRedeemedBenefitCodesForOrganisation(prisma, user.organisationId),
      ])
    : [null, [] as string[]];

  return {
    firstName: user.firstName,
    organisationName: user.organisation?.name ?? null,
    membershipTierLabel: membership?.tierLabel ?? "Unknown tier",
    membershipTierKey: membership?.tierKey ?? null,
    membershipTierRank: membership?.tierRank ?? null,
    membershipExpiry: membership?.expiry ?? null,
    membershipManagerName: membership?.clientExperienceManager?.name ?? null,
    redeemedBenefitCodes,
  };
}
