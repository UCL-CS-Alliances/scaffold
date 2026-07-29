// src/lib/membership-dashboard-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";
import { BENEFITS, type BenefitId } from "@/content/benefits";

function requireAdmin(roleKeys: unknown) {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

export async function saveRedeemedBenefitsAction(input: {
  userId: string;
  redeemedBenefitCodes: BenefitId[];
}) {
  const session = await getServerAuthSession();
  const roleKeys = (session?.user as any)?.roleKeys;
  requireAdmin(roleKeys);

  // Actor for the audit record. Email is denormalised into the record's data
  // because AuditLog.actorId is ON DELETE SET NULL.
  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  // Validate benefit ids exist
  const allowed = new Set(BENEFITS.map((b) => b.id));
  for (const code of input.redeemedBenefitCodes) {
    if (!allowed.has(code)) throw new Error(`Unknown benefit code: ${code}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      organisation: true,
      memberships: { where: { isActive: true } },
      membershipDashboardMember: true,
    },
  });

  if (!user) throw new Error("User not found.");

  const existing = user.membershipDashboardMember;

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
          entityType: "MembershipDashboardMember",
          // Target User.id, not the projection row id, so member-history
          // queries hit the (entityType, entityId) index.
          entityId: user.id,
          action: "UPDATE",
          actorId,
          data: {
            targetUserId: user.id,
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

    const activeMembership = user.memberships.at(0) ?? null;
    const memberKey = user.organisation?.slug ?? `user-${user.id.slice(0, 12)}`;

    await tx.membershipDashboardMember.create({
      data: {
        userId: user.id,
        membershipId: activeMembership?.id ?? null,
        memberKey,
        redeemedBenefitCodes: input.redeemedBenefitCodes,
      },
    });

    if (hasChanges) {
      await recordAuditLog(tx, {
        entityType: "MembershipDashboardMember",
        entityId: user.id,
        action: "CREATE",
        actorId,
        data: {
          targetUserId: user.id,
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
