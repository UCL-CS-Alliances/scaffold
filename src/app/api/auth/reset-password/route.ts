import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; token?: string; password?: string };

  try {
    body = (await req.json()) as { email?: string; token?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !token || !password) {
    return NextResponse.json({ ok: false, error: "Missing required reset fields." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  try {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
      select: { identifier: true, expires: true },
    });

    if (!record || record.identifier.toLowerCase() !== email || new Date(record.expires) < new Date()) {
      return NextResponse.json({ ok: false, error: "This reset link is invalid or expired." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "This reset link is invalid or expired." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      await tx.verificationToken.deleteMany({
        where: { identifier: email },
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Password reset failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not reset password. Please try again later." },
      { status: 500 },
    );
  }
}
