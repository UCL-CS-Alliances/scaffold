// src/app/api/contact/defaults/route.ts
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { prisma } from "@/lib/prisma";
import { getSatTeamManager, SAT_MANAGER_ID } from "@/content/contactRouting";
import {
  getContactManagerOptions,
  resolveAssignedContactManager,
  type ContactManagerOption,
} from "@/lib/contact-managers";
import { getMembershipForOrganisation } from "@/lib/membership";

function satOnly(): {
  managers: ContactManagerOption[];
  defaultManagerId: string;
  defaultManagerCalendlyUrl: string;
} {
  const sat = getSatTeamManager();
  return {
    managers: [
      { id: SAT_MANAGER_ID, name: sat.name, calendlyUrl: sat.calendlyUrl },
    ],
    defaultManagerId: SAT_MANAGER_ID,
    defaultManagerCalendlyUrl: sat.calendlyUrl,
  };
}

export async function GET() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({
      isAuthenticated: false,
      name: "",
      email: "",
      organisation: "",
      ...satOnly(),
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
      ...satOnly(),
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

  const [managers, defaultManager] = await Promise.all([
    getContactManagerOptions(prisma),
    resolveAssignedContactManager(
      prisma,
      membership?.clientExperienceManager?.id ?? null,
    ),
  ]);

  return NextResponse.json({
    isAuthenticated: true,
    name,
    email,
    organisation,
    managers,
    defaultManagerId: defaultManager.id,
    defaultManagerCalendlyUrl: defaultManager.calendlyUrl,
  });
}
