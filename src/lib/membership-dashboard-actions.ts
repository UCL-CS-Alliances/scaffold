// src/lib/membership-dashboard-actions.ts
"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";
import {
  getBenefitCatalogue,
  OPEN_BENEFIT_REQUEST_STATUSES,
} from "@/lib/benefits";
import {
  getMembershipForOrganisation,
  getRedeemedBenefitCodesForOrganisation,
} from "@/lib/membership";
import {
  hasBenefitAccess,
  resolveMemberRank,
  getSupersedingBenefit,
} from "@/lib/benefit-access";

function requireAdmin(roleKeys: unknown) {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

// The old whole-array saveRedeemedBenefitsAction is gone (2026-08-12):
// redemption for a stepped benefit is now derived from step completion, and a
// bulk write of arbitrary code sets could silently break that equivalence.
// The two writers below are the only paths, and each maintains the invariant.

/**
 * Save one partner's note on one benefit (phase D). The note belongs to the
 * organisation, like membership and redemption: every contact at the partner
 * sees the same note on the benefit detail page.
 *
 * An empty body deletes the row — "no note" stays a missing row, keeping the
 * table as sparse as it was designed to be. Notes are admin-written *about*
 * a partner: they must never reach a member-editable surface.
 */
export async function saveBenefitPartnerNoteAction(input: {
  organisationId: number;
  benefitCode: string;
  body: string;
}) {
  const session = await getServerAuthSession();
  // Cast via a narrow shape rather than `any`, so the tracked no-explicit-any
  // lint baseline does not grow.
  const user = session?.user as { roleKeys?: unknown } | undefined;
  requireAdmin(user?.roleKeys);

  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  const body = String(input.body ?? "").trim();
  const organisationId = input.organisationId;

  await prisma.$transaction(async (tx) => {
    // Retired benefits are allowed: the detail page still renders for them,
    // and a note explaining why a benefit went away is a legitimate use.
    const benefit = await tx.benefit.findUnique({
      where: { code: input.benefitCode },
      select: { id: true, code: true },
    });
    if (!benefit) throw new Error(`Unknown benefit code: ${input.benefitCode}`);

    const organisation = await tx.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true },
    });
    if (!organisation) throw new Error("Organisation not found.");

    const existing = await tx.benefitPartnerNote.findUnique({
      where: {
        benefitId_organisationId: {
          benefitId: benefit.id,
          organisationId,
        },
      },
      select: { id: true, body: true },
    });

    const previous = existing?.body ?? null;
    const next = body || null;

    // No-op saves (unchanged text, or clearing a note that does not exist)
    // write nothing and are not audited.
    if (previous === next) return;

    if (next === null) {
      // previous !== next, so a row necessarily exists to delete.
      if (existing) {
        await tx.benefitPartnerNote.delete({ where: { id: existing.id } });
      }
    } else if (existing) {
      await tx.benefitPartnerNote.update({
        where: { id: existing.id },
        data: { body: next },
      });
    } else {
      await tx.benefitPartnerNote.create({
        data: { benefitId: benefit.id, organisationId, body: next },
      });
    }

    // Keyed on the organisation so a partner's whole history — redemption,
    // notes — sits under one entityId and survives any one contact's
    // deletion. Clearing is a genuine DELETE: the row is gone.
    await recordAuditLog(tx, {
      entityType: "OrganisationBenefitNote",
      entityId: String(organisationId),
      action: existing ? (next === null ? "DELETE" : "UPDATE") : "CREATE",
      actorId,
      data: {
        organisationId,
        benefitCode: benefit.code,
        actorEmail,
        previous,
        next,
      },
    });
  });
}

/**
 * Redemption ⟺ progress equivalence (decision of 2026-08-12, superseding the
 * earlier "the tracker never sets redemption"): for a benefit WITH steps,
 * "redeemed" means exactly "every step complete". This helper is the single
 * place that writes redeemedBenefitCodes to honour that — it adds or removes
 * one code on the organisation's projection row and writes the same
 * OrganisationBenefitRedemption audit row the old bulk save wrote, so the
 * admin-facing change history keeps working unchanged. Runs inside the
 * caller's transaction.
 */
async function syncRedemptionCode(
  tx: Prisma.TransactionClient,
  input: {
    organisationId: number;
    organisationSlug: string;
    benefitCode: string;
    /** Whether the code should be present after this call. */
    redeemed: boolean;
    actorId: string | null;
    actorEmail: string | null;
  },
) {
  const existing = await tx.membershipDashboardMember.findUnique({
    where: { organisationId: input.organisationId },
  });

  const previous = existing?.redeemedBenefitCodes ?? [];
  const hasCode = previous.includes(input.benefitCode);

  if (input.redeemed === hasCode) return;

  const next = input.redeemed
    ? [...previous, input.benefitCode]
    : previous.filter((code) => code !== input.benefitCode);

  const memberKey = existing?.memberKey ?? input.organisationSlug;

  if (existing) {
    await tx.membershipDashboardMember.update({
      where: { id: existing.id },
      data: { redeemedBenefitCodes: next },
    });
  } else {
    await tx.membershipDashboardMember.create({
      data: {
        organisationId: input.organisationId,
        memberKey,
        redeemedBenefitCodes: next,
      },
    });
  }

  await recordAuditLog(tx, {
    entityType: "OrganisationBenefitRedemption",
    entityId: String(input.organisationId),
    action: existing ? "UPDATE" : "CREATE",
    actorId: input.actorId,
    data: {
      organisationId: input.organisationId,
      memberKey,
      actorEmail: input.actorEmail,
      previous,
      next,
      added: input.redeemed ? [input.benefitCode] : [],
      removed: input.redeemed ? [] : [input.benefitCode],
    },
  });
}

/**
 * Save one partner's step progress for one benefit (phase E): the whole set
 * of ticked step ids in a single call, so the audit row carries added/removed
 * rather than one row per click.
 *
 * Admin ticks, members read. Redemption is DERIVED for stepped benefits
 * (2026-08-12): completing the final step marks the benefit redeemed, and
 * breaking completeness un-redeems it, both audited alongside the progress
 * change in the same transaction. The invariant lives here, server-side, so
 * no caller can record a full tick-set without the redemption following.
 */
export async function saveBenefitActionProgressAction(input: {
  organisationId: number;
  benefitCode: string;
  completedActionIds: number[];
}) {
  const session = await getServerAuthSession();
  // Cast via a narrow shape rather than `any`, so the tracked no-explicit-any
  // lint baseline does not grow.
  const user = session?.user as { roleKeys?: unknown } | undefined;
  requireAdmin(user?.roleKeys);

  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  const organisationId = input.organisationId;
  const submitted = [...new Set((input.completedActionIds ?? []).map(Number))];

  await prisma.$transaction(async (tx) => {
    const benefit = await tx.benefit.findUnique({
      where: { code: input.benefitCode },
      select: {
        id: true,
        code: true,
        actions: { select: { id: true } },
      },
    });
    if (!benefit) throw new Error(`Unknown benefit code: ${input.benefitCode}`);

    const organisation = await tx.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, slug: true },
    });
    if (!organisation) throw new Error("Organisation not found.");

    // Every submitted id must be a step of this benefit: a stale editor
    // (a colleague deleted a step meanwhile) fails loudly rather than
    // recording progress against another benefit's steps.
    const stepIds = new Set(benefit.actions.map((a) => a.id));
    for (const id of submitted) {
      if (!stepIds.has(id)) {
        throw new Error(
          "A submitted step no longer exists — reload and try again.",
        );
      }
    }

    // Scoped to this benefit's steps so one benefit's save cannot disturb
    // progress recorded on another.
    const existing = await tx.benefitActionProgress.findMany({
      where: { organisationId, benefitActionId: { in: [...stepIds] } },
      select: { benefitActionId: true },
    });

    const existingIds = new Set(existing.map((r) => r.benefitActionId));
    const submittedIds = new Set(submitted);
    const added = submitted.filter((id) => !existingIds.has(id));
    const removed = [...existingIds].filter((id) => !submittedIds.has(id));

    // No-op saves write nothing and are not audited.
    if (added.length === 0 && removed.length === 0) return;

    if (added.length > 0) {
      await tx.benefitActionProgress.createMany({
        data: added.map((benefitActionId) => ({
          organisationId,
          benefitActionId,
          completedAt: new Date(),
          completedById: actorId,
        })),
      });
    }

    if (removed.length > 0) {
      // Untick deletes the row — presence means complete, and the table
      // stays as sparse as notes and redemption.
      await tx.benefitActionProgress.deleteMany({
        where: { organisationId, benefitActionId: { in: removed } },
      });
    }

    await recordAuditLog(tx, {
      entityType: "OrganisationBenefitActionProgress",
      entityId: String(organisationId),
      action: "UPDATE",
      actorId,
      data: {
        organisationId,
        benefitCode: benefit.code,
        actorEmail,
        added,
        removed,
      },
    });

    // The equivalence: all steps complete ⟺ redeemed. Only consulted when
    // the tick-set actually changed, so a no-op save still audits nothing.
    await syncRedemptionCode(tx, {
      organisationId,
      organisationSlug: organisation.slug,
      benefitCode: benefit.code,
      redeemed: stepIds.size > 0 && submitted.length === stepIds.size,
      actorId,
      actorEmail,
    });
  });
}

/**
 * Manual redemption toggle for benefits WITHOUT process steps — the only
 * kind whose redemption is not derived from progress. Guarded: for a stepped
 * benefit this throws, because writing its redemption directly would break
 * the equivalence saveBenefitActionProgressAction maintains.
 */
export async function saveBenefitRedemptionAction(input: {
  organisationId: number;
  benefitCode: string;
  redeemed: boolean;
}) {
  const session = await getServerAuthSession();
  // Cast via a narrow shape rather than `any`, so the tracked no-explicit-any
  // lint baseline does not grow.
  const user = session?.user as { roleKeys?: unknown } | undefined;
  requireAdmin(user?.roleKeys);

  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  await prisma.$transaction(async (tx) => {
    const benefit = await tx.benefit.findUnique({
      where: { code: input.benefitCode },
      select: { code: true, actions: { select: { id: true }, take: 1 } },
    });
    if (!benefit) throw new Error(`Unknown benefit code: ${input.benefitCode}`);
    if (benefit.actions.length > 0) {
      throw new Error(
        "This benefit has process steps; its redemption follows the step tracker.",
      );
    }

    const organisation = await tx.organisation.findUnique({
      where: { id: input.organisationId },
      select: { id: true, slug: true },
    });
    if (!organisation) throw new Error("Organisation not found.");

    await syncRedemptionCode(tx, {
      organisationId: input.organisationId,
      organisationSlug: organisation.slug,
      benefitCode: benefit.code,
      redeemed: input.redeemed,
      actorId,
      actorEmail,
    });
  });
}

export type RequestBenefitResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "UNAUTHENTICATED"
        | "NO_ORGANISATION"
        | "UNKNOWN_BENEFIT"
        | "NOT_ELIGIBLE"
        | "SUPERSEDED"
        | "ALREADY_REDEEMED"
        | "ALREADY_REQUESTED"
        | "NOTE_REQUIRED"
        | "TOO_LONG";
      message: string;
    };

const REQUEST_NOTE_MAX = 2000;
const REQUEST_OPTIONAL_FIELD_MAX = 200;

/**
 * A member registers their organisation's interest in a benefit — the first
 * member-facing (non-admin) mutation in this file. It does NOT mark the
 * benefit redeemed: "redeemed" still means fully delivered, set by the client
 * experience manager. The request is the organisation's, like redemption —
 * one open request per (organisation, benefit), whoever raised it, enforced
 * by the partial unique index the P2002 catch below maps to a result.
 *
 * This is the first action in the file that returns a typed result instead of
 * throwing, deliberately: the admin actions throw because their callers can
 * act on a raw message, but Next.js masks thrown error messages in
 * production, so a member would see "An error occurred" instead of "a
 * colleague has already requested this". Genuinely exceptional conditions (a
 * database failure) still throw.
 *
 * Two absences are decisions, not oversights: no audit row — the request row
 * itself carries actor, timestamp and content, so creation is
 * self-documenting, and AuditLog earns its place when sub-issue F adds
 * transitions (sub-issue H owns auditing them) — and no rate limiting: the
 * partial unique index makes duplicates impossible, every request needs a
 * written note, and the only in-repo limiter (api/contact/submit) is
 * documented as single-process-only and must not be copied into a server
 * action.
 */
export async function requestBenefitRedemptionAction(input: {
  benefitCode: string;
  note: string;
  preferredTimeframe?: string;
  contactPreference?: string;
}): Promise<RequestBenefitResult> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return {
      ok: false,
      reason: "UNAUTHENTICATED",
      message: "Sign in to request a benefit.",
    };
  }

  const note = String(input.note ?? "").trim();
  const preferredTimeframe =
    String(input.preferredTimeframe ?? "").trim() || null;
  const contactPreference = String(input.contactPreference ?? "").trim() || null;

  if (!note) {
    return {
      ok: false,
      reason: "NOTE_REQUIRED",
      message: "Please tell us what you would like — the note is required.",
    };
  }
  if (note.length > REQUEST_NOTE_MAX) {
    return {
      ok: false,
      reason: "TOO_LONG",
      message: `The note can be at most ${REQUEST_NOTE_MAX} characters.`,
    };
  }
  if (
    (preferredTimeframe?.length ?? 0) > REQUEST_OPTIONAL_FIELD_MAX ||
    (contactPreference?.length ?? 0) > REQUEST_OPTIONAL_FIELD_MAX
  ) {
    return {
      ok: false,
      reason: "TOO_LONG",
      message: `The timeframe and contact fields can each be at most ${REQUEST_OPTIONAL_FIELD_MAX} characters.`,
    };
  }

  try {
    return await prisma.$transaction(
      async (tx): Promise<RequestBenefitResult> => {
        // The organisation comes from the user's own record, never from the
        // client — a member can only ever request for their organisation.
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { organisationId: true },
        });
        if (!user?.organisationId) {
          return {
            ok: false,
            reason: "NO_ORGANISATION",
            message:
              "Your account is not linked to a partner organisation, so there is no membership to request against.",
          };
        }
        const organisationId = user.organisationId;

        // The ACTIVE catalogue, not getKnownBenefitCodes: that set includes
        // retired benefits so an admin can clear a stale redemption, but a
        // withdrawn benefit must not be requestable — its detail page 404s.
        const benefits = await getBenefitCatalogue(tx);
        const benefit = benefits.find((b) => b.id === input.benefitCode);
        if (!benefit) {
          return {
            ok: false,
            reason: "UNKNOWN_BENEFIT",
            message: "This benefit is not available to request.",
          };
        }

        // Eligibility from the database — the session's tier claims are
        // display-only and go stale the moment a tier changes.
        const membership = await getMembershipForOrganisation(
          tx,
          organisationId,
        );
        const memberRank = membership
          ? resolveMemberRank(membership.tierRank, membership.tierKey)
          : null;
        if (!hasBenefitAccess(memberRank, benefit.tierMinRank)) {
          return {
            ok: false,
            reason: "NOT_ELIGIBLE",
            message:
              "This benefit is not included in your organisation's membership tier.",
          };
        }

        // Mirrors the detail page's SUPERSEDED status, which never shows the
        // request button — the server must agree or the UI gate is a hole.
        const superseding = getSupersedingBenefit(
          memberRank,
          benefits,
          benefit.id,
        );
        if (superseding) {
          return {
            ok: false,
            reason: "SUPERSEDED",
            message: `Your membership includes ${superseding.label}, which replaces this benefit — request that instead.`,
          };
        }

        const redeemed = await getRedeemedBenefitCodesForOrganisation(
          tx,
          organisationId,
        );
        if (redeemed.includes(benefit.id)) {
          return {
            ok: false,
            reason: "ALREADY_REDEEMED",
            message: "Your organisation has already redeemed this benefit.",
          };
        }

        const benefitRow = await tx.benefit.findUnique({
          where: { code: benefit.id },
          select: { id: true },
        });
        if (!benefitRow) {
          // The catalogue resolved it moments ago; vanishing mid-transaction
          // is genuinely exceptional.
          throw new Error(`Benefit ${benefit.id} no longer exists.`);
        }

        const existing = await tx.benefitRedemptionRequest.findFirst({
          where: {
            organisationId,
            benefitId: benefitRow.id,
            status: { in: [...OPEN_BENEFIT_REQUEST_STATUSES] },
          },
          select: {
            requestedAt: true,
            requestedBy: { select: { firstName: true, lastName: true } },
          },
        });
        if (existing) {
          const who = existing.requestedBy
            ? `${existing.requestedBy.firstName} ${existing.requestedBy.lastName}`
            : "A colleague";
          const when = new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(existing.requestedAt);
          return {
            ok: false,
            reason: "ALREADY_REQUESTED",
            message: `${who} already requested this for your organisation on ${when}.`,
          };
        }

        await tx.benefitRedemptionRequest.create({
          data: {
            organisationId,
            benefitId: benefitRow.id,
            note,
            preferredTimeframe,
            contactPreference,
            requestedById: userId,
          },
        });

        return { ok: true };
      },
    );
  } catch (error) {
    // The partial unique index closing the race two concurrent submissions
    // (or a double-click replay) can win: the loser's create lands here and
    // must read as "already requested", not as a crash.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        reason: "ALREADY_REQUESTED",
        message: "This benefit has already been requested for your organisation.",
      };
    }
    throw error;
  }
}
