// src/app/api/account/get-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { getMembershipForOrganisation } from "@/lib/membership";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  if (!me?.id) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId") ?? (me.id as string);

  const roleKeys: string[] = me.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  const targetUserId = isAdmin ? requestedUserId : (me.id as string);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      isPrimaryContact: true,
      organisationId: true,
      defaultAppId: true,
      organisation: { select: { name: true } },
      roles: { select: { role: { select: { key: true, label: true } } } },
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  // The membership being edited is the organisation's, so editing either
  // contact at a partner shows — and saves against — the same tier and dates.
  const membership = user.organisationId
    ? await getMembershipForOrganisation(prisma, user.organisationId)
    : null;

  const expiryText = membership?.expiry
    ? new Intl.DateTimeFormat("en-GB").format(membership.expiry)
    : null;

  const membershipSummary = {
    organisationName: membership?.organisationName ?? user.organisation?.name ?? null,
    tierLabel: membership?.tierLabel ?? null,
    status: membership?.status ?? null,
    expiryText,
    managerName: membership?.managerName ?? null,
    isActive: membership?.isActive ?? null,
  };

  const membershipEdit = membership
    ? {
        membershipTierId: membership.membershipTierId,
        status: membership.status,
        managerName: membership.managerName,
        expiryText: expiryText ?? "",
        isActive: membership.isActive,
      }
    : null;

  return NextResponse.json(
    {
      ok: true,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        jobTitle: user.jobTitle,
        isPrimaryContact: user.isPrimaryContact,
        organisationId: user.organisationId,
        defaultAppId: user.defaultAppId,
        roleKeys: user.roles.map((r) => r.role.key),
      },
      membershipSummary,
      membershipEdit,
    },
    { status: 200 },
  );
}
