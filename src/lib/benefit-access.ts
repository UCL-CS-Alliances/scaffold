// src/lib/benefit-access.ts
import {
  BENEFITS,
  MEMBERSHIP_TIER_RANK,
  type Benefit,
  type BenefitId,
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
 * to work because the unused imports tree-shake out.
 */

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

export function hasBenefitAccess(
  memberRank: number | null,
  tierMin: MembershipTierKey
): boolean {
  if (memberRank == null) return false;
  return memberRank >= MEMBERSHIP_TIER_RANK[tierMin];
}

/**
 * Benefit ids that are superseded by a better benefit the member already has
 * access to — e.g. a platinum member's full-day careers stand (B17) supersedes
 * the half-day one (B08).
 */
export function getSupersededBenefitIds(
  memberRank: number | null
): Set<BenefitId> {
  const superseded = new Set<BenefitId>();
  if (memberRank == null) return superseded;

  BENEFITS.forEach((benefit) => {
    if (!benefit.supersedes?.length) return;
    if (!hasBenefitAccess(memberRank, benefit.tierMin)) return;
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
export function getSupersedingBenefit(
  memberRank: number | null,
  benefitId: BenefitId
): Benefit | null {
  if (memberRank == null) return null;

  return (
    BENEFITS.find(
      (benefit) =>
        !!benefit.supersedes?.includes(benefitId) &&
        hasBenefitAccess(memberRank, benefit.tierMin)
    ) ?? null
  );
}

/** The benefit catalogue as this member should see it, superseded ones removed. */
export function getEffectiveBenefits(memberRank: number | null): Benefit[] {
  const superseded = getSupersededBenefitIds(memberRank);
  return BENEFITS.filter((benefit) => !superseded.has(benefit.id));
}
