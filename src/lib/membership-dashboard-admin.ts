// src/lib/membership-dashboard-admin.ts
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { BENEFITS, MEMBERSHIP_TIER_RANK, type BenefitId, type MembershipTierKey } from "@/content/benefits";

export type AdminMemberListItem = {
  userId: string;
  organisationName: string;
  contactName: string;
  tierLabel: string;
  tierRank: number;
  tierKey: string;
  // not currently available in schema
  lastSignedInLabel: string; // "—" for now
};

export type AdminSelectedMember = {
  userId: string;
  organisationName: string | null;
  contactName: string;
  membershipTierLabel: string;
  membershipTierKey: string | null;
  membershipTierRank: number | null;
  membershipExpiry: Date | null;
  membershipManagerName: string | null;
  membershipStatus: string | null;

  roleKeys: string[];
  defaultAppKey: string | null;
  defaultAppName: string | null;

  redeemedBenefitCodes: BenefitId[];
};

function requireAdmin(roleKeys: unknown): asserts roleKeys is string[] {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

export async function getAdminMemberList(): Promise<AdminMemberListItem[]> {
  const memberRole = await prisma.role.findUnique({ where: { key: "MEMBER" } });

  const memberships = await prisma.membership.findMany({
    where: {
      isActive: true,
      user: memberRole
        ? { roles: { some: { roleId: memberRole.id } } }
        : undefined,
    },
    include: {
      membershipTier: true,
      organisation: true,
      user: true,
    },
    orderBy: [
      { membershipTier: { rank: "desc" } }, // Platinum -> Bronze
      { organisation: { name: "asc" } },
    ],
  });

  return memberships.map((m) => ({
    userId: m.userId,
    organisationName: m.organisation.name,
    contactName: `${m.user.firstName} ${m.user.lastName}`,
    tierLabel: m.membershipTier.label,
    tierRank: m.membershipTier.rank,
    tierKey: m.membershipTier.key,
    lastSignedInLabel: "—", // schema does not contain this yet
  }));
}

export async function getAdminSelectedMember(userId: string): Promise<AdminSelectedMember | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      organisation: true,
      defaultApp: true,
      roles: { include: { role: true } },
      memberships: {
        where: { isActive: true },
        include: { membershipTier: true, organisation: true },
      },
      membershipDashboardMember: true,
    },
  });

  if (!user) return null;

  const membership = user.memberships.at(0) ?? null;
  const tierLabel = membership?.membershipTier.label ?? "Unknown tier";
  const tierKey = membership?.membershipTier.key ?? null;
  const tierRank = membership?.membershipTier.rank ?? null;

  const redeemed = (user.membershipDashboardMember?.redeemedBenefitCodes ?? []) as BenefitId[];

  return {
    userId: user.id,
    organisationName: user.organisation?.name ?? membership?.organisation.name ?? null,
    contactName: `${user.firstName} ${user.lastName}`,
    membershipTierLabel: tierLabel,
    membershipTierKey: tierKey,
    membershipTierRank: tierRank,
    membershipExpiry: membership?.expiry ?? null,
    membershipManagerName: membership?.managerName ?? null,
    membershipStatus: membership?.status ?? null,

    roleKeys: user.roles.map((ur) => ur.role.key),
    defaultAppKey: user.defaultApp?.key ?? null,
    defaultAppName: user.defaultApp?.name ?? null,

    redeemedBenefitCodes: redeemed,
  };
}

// Helper for eligibility in UI (based on selected member rank)
export function canAccessBenefit(memberRank: number | null, tierMin: MembershipTierKey) {
  if (memberRank == null) return false;
  return memberRank >= MEMBERSHIP_TIER_RANK[tierMin];
}

export type AdminBenefitRedemptionStat = {
  benefitId: BenefitId;
  eligible: number;
  redeemed: number;
  percent: number | null; // null when eligible=0
};

export async function getAdminBenefitRedemptionStats(): Promise<AdminBenefitRedemptionStat[]> {
  // Fetch the active MEMBER role id (consistent with your other admin summary logic)
  const memberRole = await prisma.role.findUnique({ where: { key: "MEMBER" } });

  // Pull all active memberships for MEMBER users, including tier rank and redeemed codes
  const rows = await prisma.membership.findMany({
    where: {
      isActive: true,
      user: memberRole
        ? { roles: { some: { roleId: memberRole.id } } }
        : undefined,
    },
    select: {
      userId: true,
      membershipTier: { select: { rank: true } },
      user: {
        select: {
          membershipDashboardMember: { select: { redeemedBenefitCodes: true } },
        },
      },
    },
  });

  // Normalise into a simple array per member (1 user per org for now)
  const members = rows.map((r) => ({
    userId: r.userId,
    tierRank: r.membershipTier.rank,
    redeemed: new Set((r.user.membershipDashboardMember?.redeemedBenefitCodes ?? []) as BenefitId[]),
  }));

  return BENEFITS.map((b) => {
    const minRank = MEMBERSHIP_TIER_RANK[b.tierMin];
    const eligibleMembers = members.filter((m) => m.tierRank >= minRank);
    const eligible = eligibleMembers.length;
    const redeemed = eligibleMembers.filter((m) => m.redeemed.has(b.id)).length;
    const percent = eligible === 0 ? null : Math.round((redeemed / eligible) * 100);

    return { benefitId: b.id, eligible, redeemed, percent };
  });
}
