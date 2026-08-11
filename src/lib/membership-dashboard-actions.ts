// src/lib/membership-dashboard-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";
import { getKnownBenefitCodes } from "@/lib/benefits";

function requireAdmin(roleKeys: unknown) {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

export async function saveRedeemedBenefitsAction(input: {
  organisationId: number;
  redeemedBenefitCodes: string[];
}) {
  const session = await getServerAuthSession();
  const roleKeys = (session?.user as any)?.roleKeys;
  requireAdmin(roleKeys);

  // Actor for the audit record. Email is denormalised into the record's data
  // because AuditLog.actorId is ON DELETE SET NULL.
  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  // Validate benefit ids exist. Codes are no longer a compile-time union, so
  // this is the only thing standing between a hand-crafted request and an
  // arbitrary string landing in redeemedBenefitCodes.
  const allowed = await getKnownBenefitCodes(prisma);
  for (const code of input.redeemedBenefitCodes) {
    if (!allowed.has(code)) throw new Error(`Unknown benefit code: ${code}`);
  }

  const organisationId = input.organisationId;

  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { slug: true },
  });

  if (!organisation) throw new Error("Organisation not found.");

  // Redemption is the organisation's: a save made by one contact updates the
  // same row their colleague sees.
  const existing = await prisma.membershipDashboardMember.findUnique({
    where: { organisationId },
  });

  // Diff against the stored set: the action replaces the whole array, so the
  // audit record needs added/removed computed here rather than just the new
  // value.
  const previous = existing?.redeemedBenefitCodes ?? [];
  const previousSet = new Set<string>(previous);
  const nextSet = new Set<string>(input.redeemedBenefitCodes);
  const added = input.redeemedBenefitCodes.filter(
    (code) => !previousSet.has(code)
  );
  const removed = previous.filter((code) => !nextSet.has(code));

  // No-op saves (the UI can submit an unchanged set) still persist but are
  // not audited, so the trail only contains actual changes.
  const hasChanges = added.length > 0 || removed.length > 0;

  // Transactional so the redemption change and its audit record commit or
  // roll back together.
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.membershipDashboardMember.update({
        where: { id: existing.id },
        data: { redeemedBenefitCodes: input.redeemedBenefitCodes },
      });
      if (hasChanges) {
        await recordAuditLog(tx, {
          // Keyed on the organisation, so the trail is shared by its contacts
          // and survives any one of them being deleted. Historical rows written
          // against a User.id were re-keyed to this shape by the contract
          // migration, which preserved their original keys in `data`.
          entityType: "OrganisationBenefitRedemption",
          entityId: String(organisationId),
          action: "UPDATE",
          actorId,
          data: {
            organisationId,
            memberKey: existing.memberKey,
            actorEmail,
            previous,
            next: input.redeemedBenefitCodes,
            added,
            removed,
          },
        });
      }
      return;
    }

    const memberKey = organisation.slug;

    await tx.membershipDashboardMember.create({
      data: {
        organisationId,
        memberKey,
        redeemedBenefitCodes: input.redeemedBenefitCodes,
      },
    });

    if (hasChanges) {
      await recordAuditLog(tx, {
        entityType: "OrganisationBenefitRedemption",
        entityId: String(organisationId),
        action: "CREATE",
        actorId,
        data: {
          organisationId,
          memberKey,
          actorEmail,
          previous,
          next: input.redeemedBenefitCodes,
          added,
          removed,
        },
      });
    }
  });
}

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
 * Save one partner's step progress for one benefit (phase E): the whole set
 * of ticked step ids in a single call, mirroring saveRedeemedBenefitsAction,
 * so the audit row carries added/removed rather than one row per click.
 *
 * Admin ticks, members read. This must never touch redemption state —
 * whether a fully ticked process implies delivery is an open question that
 * belongs to the redemption epic, and is deliberately not assumed here.
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
      select: { id: true },
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
  });
}
