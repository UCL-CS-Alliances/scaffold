// src/app/api/account/create-user/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export const dynamic = "force-dynamic";

function generateTempPassword(len = 10) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const user = session?.user as any | undefined;
  const roleKeys: string[] = user?.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const body = (await req.json()) as {
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();

  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { ok: false, error: "Email, first name, and last name are required." },
      { status: 400 },
    );
  }

  const tempPassword = generateTempPassword(10);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  try {
    const created = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
      },
      select: { id: true },
    });

    return NextResponse.json(
      { ok: true, userId: created.id, tempPassword },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Could not create user. Email may already exist." },
      { status: 400 },
    );
  }
}
