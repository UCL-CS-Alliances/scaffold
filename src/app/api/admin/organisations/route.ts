// src/app/api/admin/organisations/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { uniqueOrganisationSlug } from "@/lib/admin-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  const roleKeys: string[] = me?.roleKeys ?? [];
  if (!me?.id || !roleKeys.includes("ADMIN")) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "").trim();

  if (!name) return NextResponse.json({ ok: false, error: "Organisation name is required." }, { status: 400 });
  if (!["UNIVERSITY", "INDUSTRY", "OTHER"].includes(type)) {
    return NextResponse.json({ ok: false, error: "Organisation type is invalid." }, { status: 400 });
  }

  const slug = await uniqueOrganisationSlug(name);

  const organisation = await prisma.organisation.create({
    data: { name, slug, type },
    select: { id: true, name: true },
  });

  return NextResponse.json({ ok: true, organisation }, { status: 200 });
}
