// src/app/post-sign-in/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { prisma } from "@/lib/prisma";

function appKeyToPath(appKey: string): string | null {
  switch (appKey) {
    case "MEMBERSHIP_DASHBOARD":
      return "/membership-dashboard";
    case "IXN_WORKFLOW_MANAGER":
      return "/ixn-workflow-manager";
    case "TALENT_DISCOVERY":
      return "/talent-discovery";
    default:
      return null;
  }
}

export default async function PostSignInRouterPage() {
  noStore();

  const session = await getServerAuthSession();

  if (!session?.user) redirect("/");

  const roleKeys = ((session.user as any).roleKeys ?? []) as string[];
  const isAdmin = roleKeys.includes("ADMIN");
  const isStudent = roleKeys.includes("STUDENT");

  // Admin always lands on membership dashboard (admin view handled inside that page)
  if (isAdmin) {
    redirect("/membership-dashboard");
  }

  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultApp: { select: { key: true } } },
  });

  const defaultAppKey = user?.defaultApp?.key ?? null;
  if (!defaultAppKey) redirect("/");

  const basePath = appKeyToPath(defaultAppKey);
  if (!basePath) redirect("/");

  // Role-aware entry points for Talent Discovery
  if (defaultAppKey === "TALENT_DISCOVERY") {
    if (isStudent) redirect("/talent-discovery?view=student");
    // Non-admins who are not students: lowest-threshold partner view by default
    redirect("/talent-discovery?view=job-board");
  }

  redirect(basePath);
}
