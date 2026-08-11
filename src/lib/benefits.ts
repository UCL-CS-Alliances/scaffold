// src/lib/benefits.ts
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

export type CatalogueBenefitProcess = {
  trigger: string | null;
  actions: string[];
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
      actions: { orderBy: { position: "asc" }, select: { body: true } },
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
      actions: row.actions.map((action) => action.body),
      outcome: row.outcome,
    },
    terms: row.terms,
  }));
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
