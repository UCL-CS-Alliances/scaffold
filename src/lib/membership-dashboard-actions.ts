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
