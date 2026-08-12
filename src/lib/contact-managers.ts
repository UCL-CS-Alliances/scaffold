// src/lib/contact-managers.ts
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  getSatTeamManager,
  resolveManagerByEmail,
  SAT_MANAGER_ID,
} from "@/content/contactRouting";

/**
 * Resolves "who handles this enquiry" now that client experience managers are
 * assigned admin users rather than free-text names. The identity (id, display
 * name) comes from the User row; the routing metadata (contact email, Trello
 * username, Calendly URL) stays in contactRouting.ts, matched by email — an
 * admin without an entry there routes via the Strategic Alliances Team until
 * one is added.
 *
 * Client-first signatures like membership.ts: callers inside an interactive
 * $transaction must pass their tx.
 */
export type ContactManagersClient = PrismaClient | Prisma.TransactionClient;

export type ContactManagerOption = {
  id: string; // admin User.id, or SAT_MANAGER_ID for the team entry
  name: string;
  calendlyUrl: string;
};

export type ResolvedContactManager = {
  id: string; // admin User.id, or SAT_MANAGER_ID
  name: string;
  email: string;
  trelloUsername: string;
  calendlyUrl: string;
};

function satResolved(): ResolvedContactManager {
  const sat = getSatTeamManager();
  return {
    id: SAT_MANAGER_ID,
    name: sat.name,
    email: sat.email,
    trelloUsername: sat.trelloUsername,
    calendlyUrl: sat.calendlyUrl,
  };
}

/**
 * The manager dropdown's options: every admin, then the Strategic Alliances
 * Team entry last — the default for members with no assigned manager and the
 * forced choice for unauthenticated visitors.
 */
export async function getContactManagerOptions(
  client: ContactManagersClient,
): Promise<ContactManagerOption[]> {
  const admins = await client.user.findMany({
    where: { roles: { some: { role: { key: "ADMIN" } } } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const sat = getSatTeamManager();

  return [
    ...admins.map((a) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      calendlyUrl: (resolveManagerByEmail(a.email) ?? sat).calendlyUrl,
    })),
    { id: SAT_MANAGER_ID, name: sat.name, calendlyUrl: sat.calendlyUrl },
  ];
}

/**
 * A posted or stored manager id, resolved to a routable manager. Null, the
 * SAT sentinel, and anything that no longer names an admin (deleted account,
 * demoted role, or a garbage id) all resolve to the SAT team — the same
 * silent degradation an unmatched name string had before.
 */
export async function resolveAssignedContactManager(
  client: ContactManagersClient,
  managerId: string | null,
): Promise<ResolvedContactManager> {
  if (!managerId || managerId === SAT_MANAGER_ID) return satResolved();

  const user = await client.user.findFirst({
    where: { id: managerId, roles: { some: { role: { key: "ADMIN" } } } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!user) return satResolved();

  const metadata = resolveManagerByEmail(user.email) ?? getSatTeamManager();

  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    email: metadata.email,
    trelloUsername: metadata.trelloUsername,
    calendlyUrl: metadata.calendlyUrl,
  };
}
