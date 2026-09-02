import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendMailgun } from "@/lib/email/enquiryMailer";

export const dynamic = "force-dynamic";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  let body: { email?: string };

  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });

      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires,
        },
      });

      const appUrl = process.env.PUBLIC_APP_URL;
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

      await sendMailgun({
        from: process.env.MAILGUN_SENDING_EMAIL!,
        to: user.email,
        cc: [],
        reply_to: "",
        subject: "Reset your UCL Computer Science Alliances password",
        text: [
          `Hi ${user.firstName || "there"},`,
          "",
          "You requested a password reset for your Alliances account.",
          "",
          `Use the following link to choose a new password: ${resetUrl}`,
          "",
          "This link expires in 60 minutes.",
          "",
          "If you did not request this, you can ignore this email.",
          "",
          "Kind regards,",
          "The Strategic Alliances team at UCL Computer Science",
        ].join("\n"),
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Password reset request failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not send reset email. Please try again later." },
      { status: 500 },
    );
  }
}
