// src/lib/membership-dashboard-admin.ts
import { prisma } from "@/lib/prisma";
import { BENEFITS, type BenefitId } from "@/content/benefits";
import { hasBenefitAccess } from "@/lib/benefit-access";
import {
  getMembershipForOrganisation,
  getRedeemedBenefitCodesForOrganisation,
} from "@/lib/membership";

export type AdminMemberListItem = {
  userId: string;
  // Grouping keys on the id, not the name: Organisation.name is not unique.
  organisationId: number;
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
  organisationId: number | null;
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

  // Driven by users rather than by membership rows: an organisation holds one
  // membership but can have several contacts, and this list has a row per
  // contact. Driving it off Membership would drop colleagues who share their
  // organisation's membership rather than holding one of their own.
  const users = await prisma.user.findMany({
    where: {
      organisationId: { not: null },
      ...(memberRole ? { roles: { some: { roleId: memberRole.id } } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      organisationId: true,
      organisation: { select: { name: true } },
    },
    orderBy: [
      { organisation: { name: "asc" } },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
  });

  if (!users.length) return [];

  const organisationIds = [
    ...new Set(
      users
        .map((u) => u.organisationId)
        .filter((id): id is number => id != null),
    ),
  ];

  const memberships = await prisma.membership.findMany({
    where: { organisationId: { in: organisationIds }, isActive: true },
    include: { membershipTier: true },
  });

  // Highest rank wins per organisation, ties by lowest id — the same rule as
  // getMembershipForOrganisation, so this list agrees with the member view.
  const membershipByOrganisation = new Map<number, (typeof memberships)[number]>();
  for (const m of memberships) {
    const current = membershipByOrganisation.get(m.organisationId);
    const wins =
      !current ||
      m.membershipTier.rank > current.membershipTier.rank ||
      (m.membershipTier.rank === current.membershipTier.rank && m.id < current.id);
    if (wins) membershipByOrganisation.set(m.organisationId, m);
  }

  // One grouped query for all members' latest LOGIN rows — not one per member.
  const userIds = users.map((u) => u.id);
  const latestLogins = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: {
      entityType: "User",
      entityId: { in: userIds },
      action: "LOGIN",
    },
    _max: { timestamp: true },
  });
  const lastSignInByUserId = new Map(
    latestLogins.map((g) => [g.entityId, g._max.timestamp]),
  );

  // Contacts whose organisation holds no active membership are dropped, which
  // preserves the membership-driven semantics this list had before.
  return users.flatMap((u) => {
    if (u.organisationId == null) return [];

    const membership = membershipByOrganisation.get(u.organisationId);
    if (!membership) return [];

    return [
      {
        userId: u.id,
        organisationId: u.organisationId,
        organisationName: u.organisation?.name ?? "Unknown organisation",
        contactName: `${u.firstName} ${u.lastName}`,
        tierLabel: membership.membershipTier.label,
        tierRank: membership.membershipTier.rank,
        tierKey: membership.membershipTier.key,
        lastSignedInLabel: formatLastSignInLabel(lastSignInByUserId.get(u.id)),
      },
    ];
  });
}

export async function getAdminSelectedMember(userId: string): Promise<AdminSelectedMember | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      organisation: true,
      defaultApp: true,
      roles: { include: { role: true } },
    },
  });

  if (!user) return null;

  // Tier and redemption are the organisation's, so both contacts at a partner
  // show identical membership details and benefit state.
  const [membership, redeemedCodes] = user.organisationId
    ? await Promise.all([
        getMembershipForOrganisation(prisma, user.organisationId),
        getRedeemedBenefitCodesForOrganisation(prisma, user.organisationId),
      ])
    : [null, [] as string[]];

  const redeemed = redeemedCodes as BenefitId[];

  return {
    userId: user.id,
    organisationName: user.organisation?.name ?? membership?.organisationName ?? null,
    contactName: `${user.firstName} ${user.lastName}`,
    membershipTierLabel: membership?.tierLabel ?? "Unknown tier",
    membershipTierKey: membership?.tierKey ?? null,
    membershipTierRank: membership?.tierRank ?? null,
    membershipExpiry: membership?.expiry ?? null,
    membershipManagerName: membership?.managerName ?? null,
    membershipStatus: membership?.status ?? null,
    organisationId: user.organisationId,

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

export type AdminBenefitRedemptionStat = {
  benefitId: BenefitId;
  eligible: number;
  redeemed: number;
  percent: number | null; // null when eligible=0
};

export async function getAdminBenefitRedemptionStats(): Promise<AdminBenefitRedemptionStat[]> {
  // Fetch the active MEMBER role id (consistent with your other admin summary logic)
  const memberRole = await prisma.role.findUnique({ where: { key: "MEMBER" } });

  // The unit here is the organisation, not the contact: eligibility and
  // redemption both belong to the partner, so a company with three people is
  // one eligible member and redeems a given benefit once.
  const memberships = await prisma.membership.findMany({
    where: {
      isActive: true,
      user: memberRole
        ? { roles: { some: { roleId: memberRole.id } } }
        : undefined,
    },
    select: {
      organisationId: true,
      membershipTier: { select: { rank: true } },
    },
  });

  const rankByOrganisation = new Map<number, number>();
  for (const m of memberships) {
    const current = rankByOrganisation.get(m.organisationId);
    if (current == null || m.membershipTier.rank > current) {
      rankByOrganisation.set(m.organisationId, m.membershipTier.rank);
    }
  }

  if (!rankByOrganisation.size) {
    return BENEFITS.map((b) => ({
      benefitId: b.id,
      eligible: 0,
      redeemed: 0,
      percent: null,
    }));
  }

  const projections = await prisma.membershipDashboardMember.findMany({
    where: { organisationId: { in: [...rankByOrganisation.keys()] } },
    select: { organisationId: true, redeemedBenefitCodes: true },
  });

  const redeemedByOrganisation = new Map<number, Set<string>>(
    projections.map((p) => [p.organisationId, new Set(p.redeemedBenefitCodes)]),
  );

  const organisations = [...rankByOrganisation.entries()].map(
    ([organisationId, tierRank]) => ({
      tierRank,
      redeemed: redeemedByOrganisation.get(organisationId) ?? new Set<string>(),
    }),
  );

  return BENEFITS.map((b) => {
    const eligibleOrganisations = organisations.filter((o) =>
      hasBenefitAccess(o.tierRank, b.tierMin),
    );
    const eligible = eligibleOrganisations.length;
    const redeemed = eligibleOrganisations.filter((o) => o.redeemed.has(b.id)).length;
    const percent = eligible === 0 ? null : Math.round((redeemed / eligible) * 100);

    return { benefitId: b.id, eligible, redeemed, percent };
  });
}
