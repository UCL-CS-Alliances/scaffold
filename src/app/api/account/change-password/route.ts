// src/app/api/account/change-password/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

type Body = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;

  if (!me?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const body = (await req.json()) as Body;

  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "Current password and new password are required." },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: "New password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: me.id as string },
    select: { passwordHash: true, email: true },
  });

  if (!user) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Change and its audit record commit or roll back together. Neither
  // password nor either hash appears in the audit data. Failed attempts
  // (wrong current password) are not audited — the trail records changes.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: me.id as string },
      data: { passwordHash },
    });

    await recordAuditLog(tx, {
      entityType: "User",
      entityId: String(me.id),
      action: "PASSWORD_CHANGE",
      actorId: String(me.id),
      data: {
        targetUserId: String(me.id),
        targetEmail: user.email,
        actorEmail: user.email,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
