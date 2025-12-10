// src/lib/membership-dashboard.ts
import { prisma } from "@/lib/prisma";

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
    include: {
      organisation: true,
      memberships: {
        where: { isActive: true },
        include: { membershipTier: true },
      },
      membershipDashboardMember: true,
    },
  });

  if (!user) return null;

  const membership = user.memberships.at(0) ?? null;

  const tierLabel = membership?.membershipTier.label ?? "Unknown tier";
  const tierKey = membership?.membershipTier.key ?? null;
  const tierRank = membership?.membershipTier.rank ?? null;
  const expiry = membership?.expiry ?? null;
  const managerName = membership?.managerName ?? null;

  const redeemedBenefitCodes =
    user.membershipDashboardMember?.redeemedBenefitCodes ?? [];

  return {
    firstName: user.firstName,
    organisationName: user.organisation?.name ?? null,
    membershipTierLabel: tierLabel,
    membershipTierKey: tierKey,
    membershipTierRank: tierRank,
    membershipExpiry: expiry,
    membershipManagerName: managerName,
    redeemedBenefitCodes,
  };
}
