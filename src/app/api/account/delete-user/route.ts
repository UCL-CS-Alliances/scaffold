// src/app/api/account/delete-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export const dynamic = "force-dynamic";

type Body = {
  targetUserId?: string;
};

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  if (!me?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const roleKeys: string[] = me.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  const body = (await req.json()) as Body;
  const targetUserId = String(body.targetUserId ?? "");

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Target user is required." }, { status: 400 });
  }

  const deletingSelf = targetUserId === String(me.id);

  if (deletingSelf) {
    if (isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Admins cannot delete their own account." },
        { status: 403 },
      );
    }
    // Non-admin self delete is allowed
  } else {
    // deleting others requires admin
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
  }

  await prisma.user.delete({ where: { id: targetUserId } });

  return NextResponse.json({ ok: true }, { status: 200 });
}
