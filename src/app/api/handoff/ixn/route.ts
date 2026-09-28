// src/app/api/handoff/ixn/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { userCanAccessApp } from "@/lib/access-control";
import { recordAuditLog } from "@/lib/audit-log";
import {
  buildIxnHandoffClaims,
  buildIxnHandoffRedirectUrl,
  getIxnHandoffConfig,
  signIxnHandoffToken,
} from "@/lib/ixn-handoff";

export const dynamic = "force-dynamic";

const GATE_PATH = "/ixn-workflow-manager";
const ACCESS_DENIED_PATH =
  "/access-denied?reason=access-denied&appKey=IXN_WORKFLOW_MANAGER";

/**
 * The handoff issuer: a browser navigation from the IXN gate page. Requires a
 * signed-in session, re-runs the app access check (the page ran it too, but a
 * URL can be typed), signs a short-lived token describing the user, and sends
 * the browser to IXN's handoff landing page with it.
 *
 * Every failure is a redirect, not a JSON body: the caller is a person in a
 * browser tab, not a script. Not signed in → the gate page, which shows the
 * sign-in form. Not entitled → the same access-denied page the gate page uses.
 * Not configured → the gate page, which then renders only the plain link.
 */
export async function GET(req: Request) {
  const session = await getServerAuthSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.redirect(new URL(GATE_PATH, req.url));
  }

  const config = getIxnHandoffConfig();
  if (!config) {
    console.error(
      "[ixn-handoff] IXN_HANDOFF_SECRET / IXN_HANDOFF_CALLBACK_URL are not set; refusing to mint a token.",
    );
    return NextResponse.redirect(new URL(GATE_PATH, req.url));
  }

  const canAccess = await userCanAccessApp(userId, "IXN_WORKFLOW_MANAGER");
  if (!canAccess) {
    return NextResponse.redirect(new URL(ACCESS_DENIED_PATH, req.url));
  }

  const claims = await buildIxnHandoffClaims(prisma, userId);
  if (!claims) {
    // The session outlived its account.
    return NextResponse.redirect(new URL(GATE_PATH, req.url));
  }

  const { token, jti, expiresAt } = await signIxnHandoffToken(
    claims,
    config.secret,
  );

  // Like the LOGIN row, a failed audit write must not block the handoff. The
  // token itself is never stored; the jti is enough to match IXN's side.
  try {
    await recordAuditLog(prisma, {
      entityType: "User",
      entityId: userId,
      action: "IXN_HANDOFF",
      actorId: userId,
      data: {
        targetUserId: userId,
        actorEmail: claims.email,
        appKey: "IXN_WORKFLOW_MANAGER",
        jti,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to record IXN_HANDOFF audit entry:", error);
  }

  return NextResponse.redirect(
    buildIxnHandoffRedirectUrl(config.callbackUrl, token),
  );
}
