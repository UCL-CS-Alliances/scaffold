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
  totalMembers: number;
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

  const tiers = await prisma.membershipTier.findMany({
    orderBy: { rank: "asc" },
    include: {
      memberships: {
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
      },
    },
  });

  const tierSummaries: AdminTierSummary[] = tiers.map((tier) => ({
    id: tier.id,
    key: tier.key,
    label: tier.label,
    rank: tier.rank,
    count: tier.memberships.length,
  }));

  const totalMembers = tierSummaries.reduce(
    (sum, t) => sum + t.count,
    0,
  );

  return {
    totalMembers,
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
