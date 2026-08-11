// src/lib/benefit-access.ts
import {
  MEMBERSHIP_TIER_RANK,
  type MembershipTierKey,
} from "@/content/benefits";

/**
 * Single source of truth for "which benefits can this member see and use".
 *
 * Benefit eligibility was previously derived independently on the benefit
 * detail page, in MemberDashboard, and in the admin data layer, with
 * normaliseTierKey duplicated verbatim between the first two. Any new benefit
 * state has to be threaded through all of them, so the logic lives here once.
 *
 * This module must stay free of server-only imports (prisma, next-auth,
 * next/headers): it is imported from client components as well as server
 * components, and pulling a server module into the client graph only appears
 * to work because the unused imports tree-shake out. That constraint is why the
 * catalogue is passed in rather than read here — the rules cannot query the
 * database themselves, so the caller supplies the benefits and this module
 * decides what the member may see.
 */

/**
 * The minimum a benefit has to expose for these rules to apply to it. Kept
 * structural rather than tied to one concrete type so the same rules work for
 * the content-side catalogue and the database-backed one.
 */
export type EligibilityBenefit = {
  id: string;
  /** The membership rank required, resolved from MembershipTier. */
  tierMinRank: number;
  supersedes?: readonly string[];
};

// Tier keys arrive from the database as free-form strings (MembershipTier.key),
// so they are normalised to the content-side union before use.
export function normaliseTierKey(key: string | null): MembershipTierKey | null {
  if (!key) return null;
  const lower = key.toLowerCase() as MembershipTierKey;
  return ["bronze", "silver", "gold", "platinum"].includes(lower)
    ? lower
    : null;
}

/**
 * Resolve a member's tier rank, preferring the rank stored against the
 * membership tier and falling back to the content-side rank for the tier key.
 */
export function resolveMemberRank(
  tierRank: number | null,
  tierKey: string | null
): number | null {
  if (tierRank != null) return tierRank;
  const normalised = normaliseTierKey(tierKey);
  return normalised ? MEMBERSHIP_TIER_RANK[normalised] : null;
}

/**
 * Both ranks come from MembershipTier now — the member's through their
 * organisation, the benefit's through its tierMin relation — so eligibility is
 * a plain comparison and no longer consults a tier table defined in code. A
 * tier added to the database therefore works without a code change.
 */
export function hasBenefitAccess(
  memberRank: number | null,
  tierMinRank: number
): boolean {
  if (memberRank == null) return false;
  return memberRank >= tierMinRank;
}

/**
 * Benefit ids that are superseded by a better benefit the member already has
 * access to — e.g. a platinum member's full-day careers stand (B17) supersedes
 * the half-day one (B08).
 */
export function getSupersededBenefitIds(
  memberRank: number | null,
  benefits: readonly EligibilityBenefit[]
): Set<string> {
  const superseded = new Set<string>();
  if (memberRank == null) return superseded;

  benefits.forEach((benefit) => {
    if (!benefit.supersedes?.length) return;
    if (!hasBenefitAccess(memberRank, benefit.tierMinRank)) return;
    benefit.supersedes.forEach((id) => superseded.add(id));
  });

  return superseded;
}

/**
 * The benefit that replaces `benefitId` for this member, or null if none does.
 * The mirror of getSupersededBenefitIds: a benefit only supersedes another once
 * the member can actually access it, so this answers "which benefit should they
 * be pointed at instead".
 */
export function getSupersedingBenefit<T extends EligibilityBenefit>(
  memberRank: number | null,
  benefits: readonly T[],
  benefitId: string
): T | null {
  if (memberRank == null) return null;

  return (
    benefits.find(
      (benefit) =>
        !!benefit.supersedes?.includes(benefitId) &&
        hasBenefitAccess(memberRank, benefit.tierMinRank)
    ) ?? null
  );
}

/**
 * The benefit catalogue as this member should see it, superseded ones removed.
 * Generic so callers get their own benefit type back rather than the minimal
 * shape these rules need.
 */
export function getEffectiveBenefits<T extends EligibilityBenefit>(
  memberRank: number | null,
  benefits: readonly T[]
): T[] {
  const superseded = getSupersededBenefitIds(memberRank, benefits);
  return benefits.filter((benefit) => !superseded.has(benefit.id));
}
