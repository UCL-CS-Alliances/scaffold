// src/lib/apps.ts
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * The app registry — one row per sub-app the platform hosts or links out to.
 * `access-control.ts` answers whether a user may use an app; this answers
 * where that app actually is, so no call site has to hardcode a path that the
 * registry already stores.
 *
 * An app with `isInternal: false` is not a route in this Next.js project: its
 * `externalUrl` points at a separate deployment (the IXN Workflow Manager is
 * the first). `basePath` stays populated for an external app, because the
 * gate page that runs the access check and links out still lives there.
 *
 * Client-first like membership.ts and platform-settings.ts, with a
 * hand-written return type for the same reason: schema changes stay inside
 * this module rather than leaking into every consumer.
 */
export type AppClient = PrismaClient | Prisma.TransactionClient;

export type RegisteredApp = {
  key: string;
  name: string;
  basePath: string;
  isInternal: boolean;
  externalUrl: string | null;
  description: string | null;
};

export async function getAppByKey(
  client: AppClient,
  key: string,
): Promise<RegisteredApp | null> {
  return client.app.findUnique({
    where: { key },
    select: {
      key: true,
      name: true,
      basePath: true,
      isInternal: true,
      externalUrl: true,
      description: true,
    },
  });
}

/**
 * Where a user entitled to `app` should actually be sent.
 *
 * Null means an external app has no `externalUrl` seeded — a seeding gap, not
 * a code path, so callers render nothing rather than a link to nowhere. The
 * benefit survey link takes the same "no value means no button, never a stub"
 * line.
 */
export function resolveAppDestination(app: RegisteredApp): string | null {
  return app.isInternal ? app.basePath : app.externalUrl;
}
