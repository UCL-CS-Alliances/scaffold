// src/lib/membership-dashboard-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
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
  // audit record (wired up in a follow-up commit) needs added/removed computed
  // here rather than just the new value.
  const previous = existing?.redeemedBenefitCodes ?? [];
  const previousSet = new Set<string>(previous);
  const nextSet = new Set<string>(input.redeemedBenefitCodes);
  const added = input.redeemedBenefitCodes.filter(
    (code) => !previousSet.has(code)
  );
  const removed = previous.filter((code) => !nextSet.has(code));
  void added;
  void removed;

  // Transactional so the audit write (added in a follow-up commit) cannot
  // diverge from the redemption change.
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.membershipDashboardMember.update({
        where: { id: existing.id },
        data: { redeemedBenefitCodes: input.redeemedBenefitCodes },
      });
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
  });
}
