// src/lib/audit-log.ts
import { headers } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Shared writer for the AuditLog table. All admin actions that need an audit
 * trail should go through this helper so records keep a consistent shape.
 *
 * Conventions:
 * - `entityId` is the id of the canonical entity the change is about (for
 *   user-scoped changes, the target User.id) so "history for this entity"
 *   queries hit the (entityType, entityId) index.
 * - `data` must never contain passwords, password hashes, tokens, or session
 *   material — only non-sensitive change metadata (ids, emails, diffs).
 * - The actor's email should be denormalised into `data` by callers: actorId
 *   is ON DELETE SET NULL, so the relation alone does not survive admin
 *   account deletion.
 * - Errors are not swallowed here. Callers running inside $transaction fail
 *   loudly and roll back together; fire-and-forget callers can catch.
 */

// The action and entityType vocabularies live in audit-log-shared, which
// imports nothing, so the admin audit tab's client component can read them
// without dragging next/headers into the browser bundle. Re-exported here so
// the 20 existing write sites keep importing what they always did.
export {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  LEGACY_AUDIT_ENTITY_TYPES,
} from "@/lib/audit-log-shared";

export type {
  AuditAction,
  AuditEntityType,
  LegacyAuditEntityType,
} from "@/lib/audit-log-shared";

import type { AuditAction } from "@/lib/audit-log-shared";

// Accepts the shared client or a transaction client, so callers can include
// the audit write in an existing $transaction.
export type AuditLogClient = PrismaClient | Prisma.TransactionClient;

export type RecordAuditLogInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string | null;
  data?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditRequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

// Best-effort request metadata capture: headers() (awaited — Next 16) only
// exists in a request scope, so scripts/seed callers get nulls rather than a
// throw. x-forwarded-for handling mirrors the contact submit route.
export async function getAuditRequestMetadata(): Promise<AuditRequestMetadata> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ipAddress = xff
      ? xff.split(",")[0]?.trim() || null
      : h.get("x-real-ip");
    return { ipAddress, userAgent: h.get("user-agent") };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function recordAuditLog(
  client: AuditLogClient,
  input: RecordAuditLogInput
) {
  // Capture request metadata unless the caller supplied either field.
  const metadata =
    input.ipAddress !== undefined || input.userAgent !== undefined
      ? { ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null }
      : await getAuditRequestMetadata();

  return client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      data: input.data,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    },
  });
}
