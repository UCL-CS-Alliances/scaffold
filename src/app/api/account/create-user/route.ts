// src/app/api/account/create-user/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const user = session?.user as any | undefined;
  const roleKeys: string[] = user?.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const password = body.password ?? "";

  if (!email || !firstName || !lastName || !password) {
    return NextResponse.json(
      { ok: false, error: "Email, first name, last name, and password are required." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    // likely unique email violation
    return NextResponse.json(
      { ok: false, error: "Could not create user. Email may already exist." },
      { status: 400 },
    );
  }
}
