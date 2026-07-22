// src/app/api/contact/submit/route.ts
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import {
  enquiriesTrelloBoardEmail,
  getSatTeamManager,
  resolveManagerByName,
  resolveTopicByLabel,
} from "@/content/contactRouting";
import { sendMail } from "@/lib/email/enquiryMailer";
import crypto from "crypto";

export const runtime = "nodejs";

type SubmitPayload = {
  name: string;
  email: string;
  organisation: string;
  managerName: string;
  topicLabel: string;
  subject: string;
  message: string;

  // Simple anti-bot measures (no external dependencies)
  humanCheckAnswer: string; // expecting "24"
  website?: string; // honeypot, must be empty
};

function generateTicketId(now: Date) {
  const yyyymmdd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const rand = crypto.randomBytes(4).readUInt32BE(0);
  const token = (rand % Math.pow(36, 5))
    .toString(36)
    .toUpperCase()
    .padStart(5, "0");
  return `SAT-${yyyymmdd}-${token}`;
}

function deriveFirstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return trimmed;
  return trimmed.slice(0, idx);
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function tooManyRequests(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 429 });
}

/**
 * Very small in-memory rate limiter.
 * Good for local dev / single Node process on a VM.
 * If you ever run multiple instances, replace with Redis or similar.
 */
type RateState = { count: number; resetAt: number };
const rateStore: Map<string, RateState> = new Map();

function getClientIp(req: Request) {
  // On many deployments, x-forwarded-for is present.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = rateStore.get(key);

  if (!existing || now > existing.resetAt) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  rateStore.set(key, existing);
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const isAuthenticated = !!session?.user;
  const userId = isAuthenticated ? ((session!.user as any).id as string | undefined) : undefined;

  // Rate limiting
  const ip = getClientIp(req);
  const rateKey = isAuthenticated && userId ? `user:${userId}` : `ip:${ip}`;

  // Tunable limits:
  // - Unauth: 5 per 10 minutes
  // - Auth: 20 per 10 minutes
  const limit = isAuthenticated ? 20 : 5;
  const windowMs = 10 * 60 * 1000;

  const rate = checkRateLimit(rateKey, limit, windowMs);
  if (!rate.ok) {
    return tooManyRequests(
      "Too many enquiries in a short period. Please wait a few minutes and try again.",
    );
  }

  let payload: SubmitPayload;
  try {
    payload = (await req.json()) as SubmitPayload;
  } catch {
    return badRequest("Invalid request body.");
  }

  // Honeypot: must be empty
  const honeypot = (payload.website ?? "").trim();
  if (honeypot) {
    // Deliberately vague
    return badRequest("Unable to submit enquiry.");
  }

  // Math challenge: “number of a triangle times 8” => 3*8 = 24
  // Keep this server-side as the source of truth.
  const answer = (payload.humanCheckAnswer ?? "").trim();
  if (answer !== "24") {
    return badRequest("Verification failed. Please answer the human check question correctly.");
  }

  // Validation
  const name = (payload.name ?? "").trim();
  const email = (payload.email ?? "").trim();
  const organisation = (payload.organisation ?? "").trim();
  const managerName = (payload.managerName ?? "").trim();
  const topicLabel = (payload.topicLabel ?? "").trim();
  const subject = (payload.subject ?? "").trim();
  const message = (payload.message ?? "").trim();

  if (!name) return badRequest("Name is required.");
  if (!email) return badRequest("Email is required.");
  if (!organisation) return badRequest("Organisation is required.");
  if (!topicLabel) return badRequest("Topic is required.");
  if (!subject) return badRequest("Subject is required.");
  if (!message) return badRequest("Message is required.");

  // If unauthenticated, force manager to SAT team (as per journey)
  const manager =
    (isAuthenticated ? resolveManagerByName(managerName) : null) ?? getSatTeamManager();

  const topic = resolveTopicByLabel(topicLabel) ?? resolveTopicByLabel("General Enquiry");
  const trelloLabel = topic?.trelloLabel ?? "#General";

  const now = new Date();
  const ticketId = generateTicketId(now);

  const subjectLine = `[${ticketId}]: ${subject} ${trelloLabel} ${manager.trelloUsername}`;

  const firstName = deriveFirstName(name);
  const timestampIso = now.toISOString();

  const body = [
    `Dear ${firstName || name},`,
    ``,
    `This is to confirm that we have received your enquiry. A member of the Strategic Alliances team, or your dedicated client experience manager will respond to you as soon as possible. This is the information we received:`,
    ``,
    `- Your name: ${name}`,
    `- Contact e-mail: ${email}`,
    `- Organisation: ${organisation}`,
    `- Client experience manager: ${manager.name}`,
    `- Submitted (UTC): ${timestampIso}`,
    ``,
    `Your enquiry:`,
    message,
    ``,
    `If you would like to follow up, please reply to all and do not change the subject line, so your message remains linked to the same ticket.`,
    ``,
    `Kind regards,`,
    `The Strategic Alliances team at UCL Computer Science`,
  ].join("\n");

  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() || `Alliances Platform <no-reply@alliances.local>`;

  const to = manager.email;
  const cc = [email, enquiriesTrelloBoardEmail];

  try {
    const result = await sendMail({
      from,
      to,
      cc,
      subject: subjectLine,
      text: body,
    });

    return NextResponse.json({
      ok: true,
      ticketId,
      managerName: manager.name,
      etherealPreviewUrl: result.previewUrl ?? null,
    });
  } catch (err) {
    console.error("Enquiry send failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send enquiry email." },
      { status: 500 },
    );
  }
}
