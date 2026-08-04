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
    prisma.membership.findMany({
      where: {
        isActive: true,
        user: memberRole
          ? {
              roles: {
                some: { roleId: memberRole.id },
              },
            }
          : undefined,
      },
      select: {
        organisationId: true,
        membershipTierId: true,
        membershipTier: { select: { rank: true } },
      },
    }),
  ]);

  // Counting organisations rather than membership rows. Until Membership is
  // re-keyed one organisation can hold a row per contact, so counting rows
  // would bill a two-contact partner twice. Highest rank wins per organisation
  // — the same rule getMembershipForOrganisation applies, so these totals agree
  // with the tier each member actually sees.
  const tierByOrganisation = new Map<number, { tierId: number; rank: number }>();
  for (const m of memberships) {
    const current = tierByOrganisation.get(m.organisationId);
    if (!current || m.membershipTier.rank > current.rank) {
      tierByOrganisation.set(m.organisationId, {
        tierId: m.membershipTierId,
        rank: m.membershipTier.rank,
      });
    }
  }

  const countByTierId = new Map<number, number>();
  for (const { tierId } of tierByOrganisation.values()) {
    countByTierId.set(tierId, (countByTierId.get(tierId) ?? 0) + 1);
  }

  const tierSummaries: AdminTierSummary[] = tiers.map((tier) => ({
    id: tier.id,
    key: tier.key,
    label: tier.label,
    rank: tier.rank,
    count: countByTierId.get(tier.id) ?? 0,
  }));

  return {
    totalMemberOrganisations: tierByOrganisation.size,
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
    membershipManagerName: membership?.managerName ?? null,
    redeemedBenefitCodes,
  };
}
