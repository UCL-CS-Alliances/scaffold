// src/app/api/account/reset-password/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export const dynamic = "force-dynamic";

type Body = { targetUserId?: string };

function generateTempPassword(len = 8) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  if (!me?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const roleKeys: string[] = me.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const body = (await req.json()) as Body;
  const targetUserId = String(body.targetUserId ?? "");
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Target user is required." }, { status: 400 });
  }

  if (targetUserId === String(me.id)) {
    return NextResponse.json(
      { ok: false, error: "Admins cannot reset their own password here. Use Change password." },
      { status: 400 },
    );
  }

  const temp = generateTempPassword(8);
  const passwordHash = await bcrypt.hash(temp, 12);

  await prisma.user.update({
    where: { id: targetUserId },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true, tempPassword: temp }, { status: 200 });
}
