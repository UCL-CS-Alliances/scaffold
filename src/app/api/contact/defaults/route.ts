// src/app/api/contact/defaults/route.ts
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { prisma } from "@/lib/prisma";
import { getSatTeamManager, resolveManagerByName } from "@/content/contactRouting";
import { getMembershipForOrganisation } from "@/lib/membership";

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
    select: {
      organisationId: true,
      organisation: { select: { name: true } },
    },
  });

  // The client experience manager is assigned to the organisation, so every
  // contact there routes to the same person.
  const membership = user?.organisationId
    ? await getMembershipForOrganisation(prisma, user.organisationId)
    : null;

  const organisation = user?.organisation?.name ?? "";
  const managerNameRaw = membership?.managerName ?? null;

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
