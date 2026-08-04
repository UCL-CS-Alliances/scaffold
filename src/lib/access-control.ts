// src/lib/access-control.ts
import { prisma } from "@/lib/prisma";
import { getMembershipForUser } from "@/lib/membership";

/**
 * Role-first + tier fallback app access:
 * - ADMIN: always allow for any app.
 * - IXN_WORKFLOW_MANAGER: allow MODULE_LEADER even without membership.
 * - Otherwise: membership-tier ALLOW rules (existing logic).
 */
export async function userCanAccessApp(userId: string, appKey: string) {
  const [user, app] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
      },
    }),
    prisma.app.findUnique({
      where: { key: appKey },
      include: {
        appAccessRules: {
          include: { minMembershipTier: true },
        },
      },
    }),
  ]);

  if (!user || !app) return false;

  const roleKeys = user.roles.map((ur) => ur.role.key);

  // 1) Role-first overrides
  if (roleKeys.includes("ADMIN")) return true;

  if (appKey === "IXN_WORKFLOW_MANAGER" && roleKeys.includes("MODULE_LEADER")) {
    return true;
  }

  // 2) Membership-tier fallback. The tier is the user's organisation's, so a
  // contact with no organisation — or whose organisation holds no active
  // membership — resolves to null and is denied, as before.
  const membership = await getMembershipForUser(prisma, userId);
  if (!membership) return false;

  const userRank = membership.tierRank;
  const rules = app.appAccessRules;

  // No rules → default deny
  if (!rules.length) return false;

  const allowMatch = rules.some((rule) => {
    if (rule.accessType !== "ALLOW") return false;
    const minRank = rule.minMembershipTier?.rank;
    if (minRank == null) return false;
    return userRank >= minRank;
  });

  return allowMatch;
}
