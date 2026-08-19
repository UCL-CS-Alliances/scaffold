// src/lib/membership-dashboard-admin.ts
import { prisma } from "@/lib/prisma";
import type { CatalogueBenefit } from "@/lib/benefits";
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
  jobTitle: string | null;
  isPrimaryContact: boolean;
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
  jobTitle: string | null;
  isPrimaryContact: boolean;
  membershipTierLabel: string;
  membershipTierKey: string | null;
  membershipTierRank: number | null;
  membershipExpiry: Date | null;
  membershipManagerName: string | null;
  membershipStatus: string | null;

  roleKeys: string[];
  defaultAppKey: string | null;
  defaultAppName: string | null;

  redeemedBenefitCodes: string[];
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
      jobTitle: true,
      isPrimaryContact: true,
      organisationId: true,
      organisation: { select: { name: true } },
    },
    orderBy: [
      { organisation: { name: "asc" } },
      // The organisation's primary contact heads its group.
      { isPrimaryContact: "desc" },
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

  // One row per organisation, so this is a straight lookup.
  const membershipByOrganisation = new Map(
    memberships.map((m) => [m.organisationId, m]),
  );

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
        jobTitle: u.jobTitle,
        isPrimaryContact: u.isPrimaryContact,
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

  const redeemed = redeemedCodes;

  return {
    userId: user.id,
    organisationName: user.organisation?.name ?? membership?.organisationName ?? null,
    contactName: `${user.firstName} ${user.lastName}`,
    jobTitle: user.jobTitle,
    isPrimaryContact: user.isPrimaryContact,
    membershipTierLabel: membership?.tierLabel ?? "Unknown tier",
    membershipTierKey: membership?.tierKey ?? null,
    membershipTierRank: membership?.tierRank ?? null,
    membershipExpiry: membership?.expiry ?? null,
    membershipManagerName: membership?.clientExperienceManager?.name ?? null,
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
  organisationId: number,
): Promise<AdminBenefitAuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: "OrganisationBenefitRedemption",
      entityId: String(organisationId),
    },
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

export type MembershipTierOption = {
  id: number;
  key: string;
  label: string;
  rank: number;
};

// The catalogue editor's tier select. Options come from the database rather
// than a hardcoded list, so a tier added to MembershipTier needs no code
// change here (the same property benefit eligibility already has).
export async function getMembershipTierOptions(): Promise<MembershipTierOption[]> {
  return prisma.membershipTier.findMany({
    select: { id: true, key: true, label: true, rank: true },
    orderBy: { rank: "asc" },
  });
}

export type AdminBenefitRedemptionStat = {
  benefitId: string;
  eligible: number;
  redeemed: number;
  percent: number | null; // null when eligible=0
};

// The catalogue is passed in rather than resolved here, as the eligibility
// rules take it: the page already needs it for the client component, so
// resolving it once and threading it through keeps it to a single query.
export async function getAdminBenefitRedemptionStats(
  benefits: CatalogueBenefit[],
): Promise<AdminBenefitRedemptionStat[]> {
  // Fetch the active MEMBER role id (consistent with your other admin summary logic)
  const memberRole = await prisma.role.findUnique({ where: { key: "MEMBER" } });

  // The unit here is the organisation, not the contact: eligibility and
  // redemption both belong to the partner, so a company with three people is
  // one eligible member and redeems a given benefit once.
  // Qualified by the organisation having at least one MEMBER contact — see the
  // matching note in getAdminDashboardSummary. One row per organisation, so no
  // deduplication is needed.
  const memberships = await prisma.membership.findMany({
    where: {
      isActive: true,
      organisation: memberRole
        ? { users: { some: { roles: { some: { roleId: memberRole.id } } } } }
        : undefined,
    },
    select: {
      organisationId: true,
      membershipTier: { select: { rank: true } },
    },
  });

  const rankByOrganisation = new Map<number, number>(
    memberships.map((m) => [m.organisationId, m.membershipTier.rank]),
  );

  if (!rankByOrganisation.size) {
    return benefits.map((b) => ({
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

  return benefits.map((b) => {
    const eligibleOrganisations = organisations.filter((o) =>
      hasBenefitAccess(o.tierRank, b.tierMinRank),
    );
    const eligible = eligibleOrganisations.length;
    const redeemed = eligibleOrganisations.filter((o) => o.redeemed.has(b.id)).length;
    const percent = eligible === 0 ? null : Math.round((redeemed / eligible) * 100);

    return { benefitId: b.id, eligible, redeemed, percent };
  });
}
