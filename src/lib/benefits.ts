// src/lib/benefits.ts
import { BenefitRequestStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * The benefit catalogue used to be a TypeScript literal that every consumer
 * imported and read directly. It is database-backed now, and this module owns
 * that resolution — read the catalogue through it rather than querying
 * prisma.benefit at a call site, so the query, the ordering and the shape stay
 * in one place. The old literal survives as the seed fixture at
 * prisma/fixtures/benefits.ts, which only the seeder reads.
 *
 * The returned shape is hand-written rather than a Prisma model type, for the
 * same reason membership.ts does it: schema changes stay inside this module.
 * It deliberately mirrors the old content-side shape (`id` is the benefit code,
 * `process` is an object) so the read path did not have to be rewritten at the
 * same time as its source changed.
 *
 * Server-only: it imports Prisma types and runs queries. The eligibility rules
 * that client components need live in benefit-access.ts, which must stay free
 * of server-only imports.
 *
 * Callers inside an interactive $transaction must pass their tx — on the pooled
 * production connection (connection_limit=1) a query issued on the global
 * client queues behind the open transaction and deadlocks it. Same rule and
 * same client-first signature as getMembershipForOrganisation.
 */
export type BenefitCatalogueClient = PrismaClient | Prisma.TransactionClient;

/** A process step with its stable BenefitAction.id, which is what the
 * per-partner progress map keys on — the detail page joins the two. */
export type CatalogueBenefitStep = {
  id: number;
  body: string;
};

export type CatalogueBenefitProcess = {
  trigger: string | null;
  actions: CatalogueBenefitStep[];
  outcome: string | null;
};

export type CatalogueBenefit = {
  /** The benefit code ("B01"). Named `id` because that is what call sites and
   * MembershipDashboardMember.redeemedBenefitCodes already key on. */
  id: string;
  label: string;
  description: string;
  category: string;

  /** Lowercase tier key ("silver"), kept for display. */
  tierMin: string;
  /** The rank access checks compare against, resolved from MembershipTier so
   * eligibility no longer depends on a content-side rank table. */
  tierMinRank: number;

  /** Codes of the benefits this one replaces. */
  supersedes: string[];

  process: CatalogueBenefitProcess;
  terms: string[];

  /** Present only on an `includeRetired` read, so the shape existing callers
   * hand to client components is unchanged. False means retired. */
  isActive?: boolean;
};

/**
 * The catalogue as members and admins should see it, ordered as the Strategic
 * Alliances Team ordered it.
 *
 * Retired benefits (isActive = false) are excluded by default: retirement
 * exists so a benefit can be withdrawn without deleting it, which would dangle
 * in the redemption history that stores bare codes. Note the consequence for
 * any lookup that turns a redeemed code into a label — a code redeemed before
 * its benefit was retired will not resolve here, and the call site falls back
 * to showing the raw code.
 *
 * `includeRetired` exists for the admin catalogue editor, which has to show a
 * retired benefit in order to restore it. It also surfaces `isActive` on each
 * entry so the editor can tell the two apart; member-facing callers never pass
 * it and their shape is unchanged.
 */
export async function getBenefitCatalogue(
  client: BenefitCatalogueClient,
  options: { includeRetired?: boolean } = {},
): Promise<CatalogueBenefit[]> {
  const includeRetired = options.includeRetired ?? false;

  const rows = await client.benefit.findMany({
    where: includeRetired ? {} : { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      tierMin: { select: { key: true, rank: true } },
      actions: { orderBy: { position: "asc" }, select: { id: true, body: true } },
    },
  });

  return rows.map((row) => ({
    ...(includeRetired ? { isActive: row.isActive } : {}),
    id: row.code,
    label: row.label,
    description: row.description,
    category: row.category,
    tierMin: row.tierMin.key.toLowerCase(),
    tierMinRank: row.tierMin.rank,
    supersedes: row.supersedesCodes,
    process: {
      trigger: row.trigger,
      actions: row.actions,
      outcome: row.outcome,
    },
    terms: row.terms,
  }));
}

export type EditorBenefitStep = {
  /** BenefitAction.id — the stable handle the reorder/delete actions take,
   * and what phase E's progress rows point at. */
  id: number;
  position: number;
  body: string;
};

export type EditorBenefit = {
  /** Benefit.id — what the catalogue server actions key on. Distinct from
   * CatalogueBenefit.id, which is the code. */
  benefitId: number;
  code: string;
  label: string;
  description: string;
  category: string;
  tierMinId: number;
  tierMinLabel: string;
  /** Rank for eligibility checks (the admin progress tracker filters on it). */
  tierMinRank: number;
  trigger: string | null;
  outcome: string | null;
  terms: string[];
  supersedesCodes: string[];
  isActive: boolean;
  steps: EditorBenefitStep[];
};

/**
 * The catalogue as the admin editor needs it: retired benefits included
 * (restoring one requires seeing it), database ids surfaced (the edit actions
 * key on Benefit.id and BenefitAction.id, not on the code), and steps carried
 * as rows rather than flattened to strings. Member-facing reads should use
 * getBenefitCatalogue; this shape exists so the editor does not have to
 * overload it.
 */
export async function getBenefitCatalogueForEditor(
  client: BenefitCatalogueClient,
): Promise<EditorBenefit[]> {
  const rows = await client.benefit.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      tierMin: { select: { id: true, label: true, rank: true } },
      actions: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, body: true },
      },
    },
  });

  return rows.map((row) => ({
    benefitId: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    category: row.category,
    tierMinId: row.tierMin.id,
    tierMinLabel: row.tierMin.label,
    tierMinRank: row.tierMin.rank,
    trigger: row.trigger,
    outcome: row.outcome,
    terms: row.terms,
    supersedesCodes: row.supersedesCodes,
    isActive: row.isActive,
    steps: row.actions,
  }));
}

/**
 * One partner's benefit notes, keyed by benefit code — one query for the
 * whole map, not one per benefit. Both surfaces read through this: the admin
 * editor takes the map, the member detail page reads a single entry out of
 * it. A missing key means no note, which is the designed-for common case —
 * the table stays sparse because an emptied note deletes the row.
 *
 * A plain object rather than a Map so the result can cross the server →
 * client component boundary as props unchanged.
 */
export async function getBenefitPartnerNotesForOrganisation(
  client: BenefitCatalogueClient,
  organisationId: number,
): Promise<Record<string, string>> {
  const rows = await client.benefitPartnerNote.findMany({
    where: { organisationId },
    select: { body: true, benefit: { select: { code: true } } },
  });

  return Object.fromEntries(rows.map((row) => [row.benefit.code, row.body]));
}

/** Presence of a key means the step is complete; the value records when.
 * completedAt is nullable in the schema as headroom, but the save action
 * always stamps it, so expect a Date in practice. */
export type BenefitActionProgressMap = Record<
  number,
  { completedAt: Date | null }
>;

/**
 * One partner's per-step benefit progress, keyed by BenefitAction.id — one
 * query for the whole map (phase E). Admin-written via
 * saveBenefitActionProgressAction, member-read on the benefit detail page.
 * Progress is the organisation's, like redemption and notes — and for a
 * stepped benefit, redemption is *derived* from it (2026-08-12): all steps
 * complete ⟺ redeemed, kept true by the save action.
 */
export async function getBenefitActionProgressForOrganisation(
  client: BenefitCatalogueClient,
  organisationId: number,
): Promise<BenefitActionProgressMap> {
  const rows = await client.benefitActionProgress.findMany({
    where: { organisationId },
    select: { benefitActionId: true, completedAt: true },
  });

  return Object.fromEntries(
    rows.map((row) => [row.benefitActionId, { completedAt: row.completedAt }]),
  );
}

/**
 * How many partners have recorded progress on each step, keyed by
 * BenefitAction.id. Steps nobody has progress on are absent. Feeds the
 * editor's step-deletion warning: deletion cascades progress rows, and the
 * confirm dialog must say how many partners that touches.
 */
export async function getBenefitActionProgressPartnerCounts(
  client: BenefitCatalogueClient,
): Promise<Record<number, number>> {
  const rows = await client.benefitActionProgress.groupBy({
    by: ["benefitActionId"],
    _count: { _all: true },
  });

  return Object.fromEntries(
    rows.map((row) => [row.benefitActionId, row._count._all]),
  );
}

/**
 * The request statuses that count as "open" — the ladder before CLOSED. One
 * definition so the resolver below, requestBenefitRedemptionAction's duplicate
 * check and the hand-written partial unique index
 * (BenefitRedemptionRequest_open_per_org_benefit_key) cannot drift apart: the
 * index enforces uniqueness over exactly this set.
 */
export const OPEN_BENEFIT_REQUEST_STATUSES = [
  BenefitRequestStatus.REQUESTED,
  BenefitRequestStatus.ACKNOWLEDGED,
  BenefitRequestStatus.IN_PROGRESS,
] as const;

export type OrganisationBenefitRequest = {
  id: number;
  benefitCode: string;
  status: BenefitRequestStatus;
  note: string;
  preferredTimeframe: string | null;
  contactPreference: string | null;
  requestedAt: Date;
  /** Full name of the contact who raised it; null once their account is deleted. */
  requestedByName: string | null;
};

/**
 * One partner's open benefit requests, keyed by benefit code — one query for
 * the whole map, not one per benefit. A missing key means nothing open for
 * that benefit, the common case; the partial unique index guarantees at most
 * one open request per benefit, so the code key cannot collide. CLOSED
 * requests are history and deliberately absent.
 *
 * A plain object rather than a Map so the result can cross the server →
 * client component boundary as props unchanged.
 */
export async function getOpenBenefitRequestsForOrganisation(
  client: BenefitCatalogueClient,
  organisationId: number,
): Promise<Record<string, OrganisationBenefitRequest>> {
  const rows = await client.benefitRedemptionRequest.findMany({
    where: {
      organisationId,
      status: { in: [...OPEN_BENEFIT_REQUEST_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      note: true,
      preferredTimeframe: true,
      contactPreference: true,
      requestedAt: true,
      benefit: { select: { code: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return Object.fromEntries(
    rows.map((row) => [
      row.benefit.code,
      {
        id: row.id,
        benefitCode: row.benefit.code,
        status: row.status,
        note: row.note,
        preferredTimeframe: row.preferredTimeframe,
        contactPreference: row.contactPreference,
        requestedAt: row.requestedAt,
        requestedByName: row.requestedBy
          ? `${row.requestedBy.firstName} ${row.requestedBy.lastName}`
          : null,
      },
    ]),
  );
}

/**
 * Every benefit code the catalogue knows about, retired ones included.
 *
 * Validation of a submitted code has to accept a retired benefit: an admin
 * clearing a redemption recorded before the benefit was withdrawn is editing
 * history that is still legitimately there, and rejecting it would leave the
 * code stuck on the organisation with no way to remove it.
 */
export async function getKnownBenefitCodes(
  client: BenefitCatalogueClient,
): Promise<Set<string>> {
  const rows = await client.benefit.findMany({ select: { code: true } });
  return new Set(rows.map((row) => row.code));
}
