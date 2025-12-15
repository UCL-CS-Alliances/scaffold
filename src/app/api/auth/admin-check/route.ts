// src/app/api/auth/admin-check/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  email?: string;
  password?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  // Mirror your authorize() strictness
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, isAdmin: false, error: "Email and password are required" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: { include: { role: true } },
    },
  });

  if (!user) {
    // Keep response generic (same security posture as authorize())
    return NextResponse.json({ ok: false, isAdmin: false }, { status: 200 });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ ok: false, isAdmin: false }, { status: 200 });
  }

  const isAdmin = user.roles.some((ur) => ur.role.key === "ADMIN");

  return NextResponse.json({ ok: true, isAdmin }, { status: 200 });
}
