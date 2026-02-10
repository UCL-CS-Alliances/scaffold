// src/app/api/contact/defaults/route.ts
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { prisma } from "@/lib/prisma";
import { getSatTeamManager, resolveManagerByName } from "@/content/contactRouting";

export async function GET() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({
      isAuthenticated: false,
      name: "",
      email: "",
      organisation: "",
      defaultManagerName: "Strategic Alliances Team",
    });
  }

  const userId = (session.user as any).id as string | undefined;
  const name = session.user.name ?? "";
  const email = session.user.email ?? "";

  if (!userId) {
    // Defensive fallback: authenticated session should include id in your setup.
    return NextResponse.json({
      isAuthenticated: true,
      name,
      email,
      organisation: "",
      defaultManagerName: "Strategic Alliances Team",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      organisation: true,
      memberships: {
        where: { isActive: true },
        select: { managerName: true },
        take: 1,
      },
    },
  });

  const organisation = user?.organisation?.name ?? "";
  const managerNameRaw = user?.memberships?.[0]?.managerName ?? null;

  const defaultManager =
    resolveManagerByName(managerNameRaw) ?? getSatTeamManager();

  return NextResponse.json({
    isAuthenticated: true,
    name,
    email,
    organisation,
    defaultManagerName: defaultManager.name,
  });
}
