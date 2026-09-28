// src/lib/ixn-handoff.ts
import { SignJWT } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getMembershipForUser } from "@/lib/membership";

/**
 * The Alliances → IXN handoff: how a user who is already signed in here gets
 * into the IXN Workflow Manager without a second manual login.
 *
 * This module is the Alliances side of the integration contract and the only
 * place that knows the token's shape. IXN's `lib/auth/handoff-policy` is the
 * other side: it verifies what this signs. Change one and the other must move.
 *
 * The contract:
 *   - HS256 JWT signed with the shared IXN_HANDOFF_SECRET, which must differ
 *     per environment (a preview deployment never carries production's key).
 *   - `iss: "alliances"`, `aud: "ixn"`, `sub` = email, a random `jti` that IXN
 *     treats as single-use, and a 60-second expiry — long enough for one
 *     redirect chain, short enough that a leaked URL is worthless.
 *   - Claims: email (lower-cased, the cross-database key), firstName,
 *     lastName, name, roleKeys (our role keys, un-mapped — IXN applies
 *     ADMIN → SAT, MODULE_LEADER → MODULE_LEADER, MEMBER → PARTNER, STUDENT →
 *     refused), org, orgType, tier (the organisation's membership tier key,
 *     read from the database and never from the session claim, which goes
 *     stale).
 *
 * Roles are not entitlement. `userCanAccessApp` decides who may use IXN
 * (role-first, then the organisation's tier), and the route mints a token
 * only after that check passes — so a valid token *is* the entitlement
 * assertion, and IXN needs no view of our access rules. Roles ride along for
 * capability once inside, never for admission.
 *
 * Client-first like membership.ts so the read can share a transaction.
 */
export type IxnHandoffClient = PrismaClient | Prisma.TransactionClient;

export const IXN_HANDOFF_ISSUER = "alliances";
export const IXN_HANDOFF_AUDIENCE = "ixn";
export const IXN_HANDOFF_TTL_SECONDS = 60;

export type IxnHandoffClaims = {
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  roleKeys: string[];
  org: string | null;
  orgType: string | null;
  tier: string | null;
};

type IxnHandoffConfig = {
  secret: string;
  callbackUrl: string;
};

/**
 * Both values or nothing: a secret with no callback (or vice versa) is a
 * misconfiguration, and the gate page falls back to the plain link rather
 * than offering a handoff that would fail.
 */
export function getIxnHandoffConfig(): IxnHandoffConfig | null {
  const secret = process.env.IXN_HANDOFF_SECRET?.trim();
  const callbackUrl = process.env.IXN_HANDOFF_CALLBACK_URL?.trim();
  if (!secret || !callbackUrl) return null;
  return { secret, callbackUrl };
}

export function isIxnHandoffConfigured(): boolean {
  return getIxnHandoffConfig() !== null;
}

/**
 * The claims for a user. Null when the user no longer exists — the caller has
 * a session, but a session outlives its account.
 *
 * Callers must run the access check first; this only describes the user.
 */
export async function buildIxnHandoffClaims(
  client: IxnHandoffClient,
  userId: string,
): Promise<IxnHandoffClaims | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      roles: { select: { role: { select: { key: true } } } },
      organisation: { select: { name: true, type: true } },
    },
  });
  if (!user) return null;

  const membership = await getMembershipForUser(client, userId);

  return {
    email: user.email.trim().toLowerCase(),
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    roleKeys: user.roles.map((ur) => ur.role.key),
    org: user.organisation?.name ?? null,
    orgType: user.organisation?.type ?? null,
    tier: membership?.tierKey ?? null,
  };
}

export type SignedIxnHandoff = {
  token: string;
  jti: string;
  expiresAt: Date;
};

export async function signIxnHandoffToken(
  claims: IxnHandoffClaims,
  secret: string,
): Promise<SignedIxnHandoff> {
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + IXN_HANDOFF_TTL_SECONDS;

  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(IXN_HANDOFF_ISSUER)
    .setAudience(IXN_HANDOFF_AUDIENCE)
    .setSubject(claims.email)
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(new TextEncoder().encode(secret));

  return { token, jti, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/** IXN's landing page for the handoff, with the token in the query string. */
export function buildIxnHandoffRedirectUrl(
  callbackUrl: string,
  token: string,
): string {
  const url = new URL(callbackUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
