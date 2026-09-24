// src/app/post-sign-in/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { prisma } from "@/lib/prisma";

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

  // basePath comes from the App registry rather than a switch in this file, so
  // adding an app needs no edit here. Selected through the user row because
  // this page already reads it — one query rather than two on the pooled
  // connection.
  //
  // basePath is also the right destination for an external app
  // (isInternal: false): that route runs the access gate and explains the
  // separate sign-in before linking out, both of which redirecting straight to
  // externalUrl would skip.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultApp: { select: { key: true, basePath: true } },
    },
  });

  const defaultApp = user?.defaultApp ?? null;
  if (!defaultApp) redirect("/");

  // Role-aware entry points for Talent Discovery
  if (defaultApp.key === "TALENT_DISCOVERY") {
    if (isStudent) redirect("/talent-discovery?view=student");
    // Non-admins who are not students: lowest-threshold partner view by default
    redirect("/talent-discovery?view=job-board");
  }

  redirect(defaultApp.basePath);
}
