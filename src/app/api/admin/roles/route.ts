// src/app/api/admin/roles/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  const roleKeys: string[] = me?.roleKeys ?? [];
  if (!me?.id || !roleKeys.includes("ADMIN")) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const key = String(body.key ?? "").trim().toUpperCase();
  const label = String(body.label ?? "").trim();

  if (!key || !/^[A-Z0-9_]+$/.test(key)) {
    return NextResponse.json({ ok: false, error: "Role key must be uppercase alphanumeric with underscores." }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ ok: false, error: "Role label is required." }, { status: 400 });
  }

  try {
    const role = await prisma.role.create({
      data: { key, label },
      select: { id: true, key: true, label: true },
    });
    return NextResponse.json({ ok: true, role }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "Role key already exists." }, { status: 400 });
  }
}
