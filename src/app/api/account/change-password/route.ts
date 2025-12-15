// src/app/api/account/change-password/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

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
    select: { passwordHash: true },
  });

  if (!user) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: me.id as string },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
