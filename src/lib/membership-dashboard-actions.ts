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

  if (existing) {
    await prisma.membershipDashboardMember.update({
      where: { id: existing.id },
      data: { redeemedBenefitCodes: input.redeemedBenefitCodes },
    });
    return;
  }

  const activeMembership = user.memberships.at(0) ?? null;
  const memberKey = user.organisation?.slug ?? `user-${user.id.slice(0, 12)}`;

  await prisma.membershipDashboardMember.create({
    data: {
      userId: user.id,
      membershipId: activeMembership?.id ?? null,
      memberKey,
      redeemedBenefitCodes: input.redeemedBenefitCodes,
    },
  });
}
