// src/app/api/account/get-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

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
      organisationId: true,
      defaultAppId: true,
      organisation: { select: { name: true } },
      roles: { select: { role: { select: { key: true, label: true } } } },
      memberships: {
        where: { isActive: true },
        take: 1,
        include: {
          organisation: { select: { name: true } },
          membershipTier: { select: { id: true, label: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const activeMembership = user.memberships[0] ?? null;

  const membershipSummary = {
    organisationName: activeMembership?.organisation?.name ?? user.organisation?.name ?? null,
    tierLabel: activeMembership?.membershipTier?.label ?? null,
    status: activeMembership?.status ?? null,
    expiryText: activeMembership?.expiry
      ? new Intl.DateTimeFormat("en-GB").format(activeMembership.expiry)
      : null,
    managerName: activeMembership?.managerName ?? null,
    isActive: activeMembership?.isActive ?? null,
  };

  const membershipEdit = activeMembership
    ? {
        membershipTierId: activeMembership.membershipTierId,
        status: activeMembership.status,
        managerName: activeMembership.managerName,
        expiryText: activeMembership.expiry
          ? new Intl.DateTimeFormat("en-GB").format(activeMembership.expiry)
          : "",
        isActive: activeMembership.isActive,
      }
    : null;

  return NextResponse.json(
    {
      ok: true,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
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
