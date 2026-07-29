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
  // Derived from the newest LOGIN audit row; "—" when never signed in.
  lastSignedInLabel: string;
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

// Sign-ins are moments rather than dates, so the label carries a time — same
// en-GB style as the admin client's formatDateTimeGB.
function formatLastSignInLabel(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
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

  // One grouped query for all members' latest LOGIN rows — not one per member.
  const userIds = memberships.map((m) => m.userId);
  const latestLogins = userIds.length
    ? await prisma.auditLog.groupBy({
        by: ["entityId"],
        where: {
          entityType: "User",
          entityId: { in: userIds },
          action: "LOGIN",
        },
        _max: { timestamp: true },
      })
    : [];
  const lastSignInByUserId = new Map(
    latestLogins.map((g) => [g.entityId, g._max.timestamp]),
  );

  return memberships.map((m) => ({
    userId: m.userId,
    organisationName: m.organisation.name,
    contactName: `${m.user.firstName} ${m.user.lastName}`,
    tierLabel: m.membershipTier.label,
    tierRank: m.membershipTier.rank,
    tierKey: m.membershipTier.key,
    lastSignedInLabel: formatLastSignInLabel(lastSignInByUserId.get(m.userId)),
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

export type AdminBenefitAuditEntry = {
  id: string;
  action: string; // "UPDATE" | "CREATE"
  timestamp: Date;
  // Actor from the live relation when it exists; actorId is ON DELETE SET
  // NULL, so deleted admins fall back to the email denormalised into data.
  actorName: string | null;
  actorEmail: string | null;
  actorDeleted: boolean;
  previous: string[];
  next: string[];
  added: string[];
  removed: string[];
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function getAdminBenefitAuditTrail(
  userId: string,
): Promise<AdminBenefitAuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entityType: "MembershipDashboardMember", entityId: userId },
    orderBy: { timestamp: "desc" },
    take: 20,
    include: { actor: true },
  });

  return rows.map((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const denormalisedEmail =
      typeof data.actorEmail === "string" ? data.actorEmail : null;

    return {
      id: r.id,
      action: r.action,
      timestamp: r.timestamp,
      actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : null,
      actorEmail: r.actor?.email ?? denormalisedEmail,
      actorDeleted: r.actor == null,
      previous: asStringArray(data.previous),
      next: asStringArray(data.next),
      added: asStringArray(data.added),
      removed: asStringArray(data.removed),
    };
  });
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
