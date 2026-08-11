// src/lib/benefit-catalogue-actions.ts
"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog, type AuditLogClient } from "@/lib/audit-log";
import { getKnownBenefitCodes } from "@/lib/benefits";

//
// Admin-only server actions for editing the benefit catalogue (phase C of the
// "Move the benefit catalogue into the database" epic). Split from
// membership-dashboard-actions.ts because the catalogue is its own concern
// and this file carries its own snapshot/diff plumbing; the admin re-check
// convention is identical.
//
// Benefits are retired, never deleted: redeemedBenefitCodes stores bare codes
// with no FK, so a delete would dangle in redemption history — hence the
// retire/restore pair and no delete action here.
//

function requireAdmin(roleKeys: unknown) {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

async function getActor() {
  const session = await getServerAuthSession();
  // Cast via a narrow shape rather than `any`: same convention, but the lint
  // debt cleanup must not grow (no-explicit-any is the tracked baseline).
  const user = session?.user as { roleKeys?: unknown } | undefined;
  requireAdmin(user?.roleKeys);
  // Email is denormalised into audit data because actorId is ON DELETE SET NULL.
  return {
    actorId: session?.user?.id ?? null,
    actorEmail: session?.user?.email ?? null,
  };
}

// The editable fields, shared by create and update. Code is deliberately
// absent: it is the stable identity redemption history stores, assigned once
// at creation and never editable.
export type CatalogueBenefitInput = {
  label: string;
  description: string;
  category: string;
  tierMinId: number;
  trigger: string | null;
  outcome: string | null;
  terms: string[];
  supersedesCodes: string[];
};

// State captured before and after a save; the audit diff is computed between
// the two rather than reconstructed from the request body, as update-user does.
type BenefitAuditSnapshot = {
  label: string;
  description: string;
  category: string;
  tierMinId: number;
  trigger: string | null;
  outcome: string | null;
  terms: string[];
  supersedesCodes: string[];
  isActive: boolean;
};

async function getBenefitAuditSnapshot(
  client: AuditLogClient,
  benefitId: number,
): Promise<(BenefitAuditSnapshot & { code: string }) | null> {
  const row = await client.benefit.findUnique({
    where: { id: benefitId },
    select: {
      code: true,
      label: true,
      description: true,
      category: true,
      tierMinId: true,
      trigger: true,
      outcome: true,
      terms: true,
      supersedesCodes: true,
      isActive: true,
    },
  });
  return row;
}

// Any new field on the snapshot must be listed here too, or it saves
// correctly and silently never appears in the audit trail (update-user's
// documented trap). JSON comparison so the two array fields diff correctly.
const benefitFields = [
  "label",
  "description",
  "category",
  "tierMinId",
  "trigger",
  "outcome",
  "terms",
  "supersedesCodes",
  "isActive",
] as const;

function diffBenefitSnapshots(
  before: BenefitAuditSnapshot,
  after: BenefitAuditSnapshot,
) {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  for (const field of benefitFields) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      previous[field] = before[field];
      next[field] = after[field];
    }
  }
  return Object.keys(next).length ? { benefit: { previous, next } } : {};
}

/**
 * Validate and normalise the editable fields. Runs inside the caller's
 * transaction (client-first) because it reads MembershipTier and the known
 * codes — never the global client from inside a $transaction.
 *
 * `ownCode` is the benefit's own code on update, so it cannot supersede
 * itself; on create the code does not exist yet, so an attempt to supersede
 * it fails the known-codes check instead.
 */
async function validateBenefitInput(
  client: AuditLogClient,
  input: CatalogueBenefitInput,
  ownCode: string | null,
): Promise<CatalogueBenefitInput> {
  const label = String(input.label ?? "").trim();
  const description = String(input.description ?? "").trim();
  const category = String(input.category ?? "").trim();

  if (!label || !description || !category) {
    throw new Error("Label, description and category are required.");
  }

  const tierMinId = Number(input.tierMinId);
  const tier = Number.isInteger(tierMinId)
    ? await client.membershipTier.findUnique({
        where: { id: tierMinId },
        select: { id: true },
      })
    : null;
  if (!tier) {
    throw new Error("Minimum tier not found.");
  }

  // The editor picks supersedes entries from existing benefits, never free
  // text — this check is what lets supersedesCodes stay a String[] of codes
  // rather than a self-relation (decision 3): an unknown code cannot be
  // stored. Known codes include retired benefits, deliberately: superseding
  // a retired benefit is legitimate history.
  const known = await getKnownBenefitCodes(client);
  const supersedesCodes = [...new Set(input.supersedesCodes ?? [])].map((c) =>
    String(c).trim(),
  );
  for (const code of supersedesCodes) {
    if (!known.has(code)) throw new Error(`Unknown benefit code: ${code}`);
    if (ownCode && code === ownCode) {
      throw new Error("A benefit cannot supersede itself.");
    }
  }

  const triggerRaw = String(input.trigger ?? "").trim();
  const outcomeRaw = String(input.outcome ?? "").trim();

  return {
    label,
    description,
    category,
    tierMinId,
    trigger: triggerRaw || null,
    outcome: outcomeRaw || null,
    terms: (input.terms ?? []).map((t) => String(t).trim()).filter(Boolean),
    supersedesCodes,
  };
}

/**
 * The next code in the B## sequence: highest existing B-number plus one,
 * zero-padded to at least two digits ("B18", and "B100" once past 99).
 * Codes not matching ^B\d+$ are ignored, so a hand-inserted oddity cannot
 * break creation (decision 1).
 */
async function nextBenefitCode(client: AuditLogClient): Promise<string> {
  const known = await getKnownBenefitCodes(client);
  let max = 0;
  for (const code of known) {
    const match = /^B(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `B${String(max + 1).padStart(2, "0")}`;
}

export async function createCatalogueBenefitAction(
  input: CatalogueBenefitInput,
): Promise<{ id: number; code: string }> {
  const { actorId, actorEmail } = await getActor();

  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const fields = await validateBenefitInput(tx, input, null);
      const code = await nextBenefitCode(tx);

      // New benefits append to the end of the catalogue; ordering beyond that
      // is not an editor feature.
      const maxSort = await tx.benefit.aggregate({ _max: { sortOrder: true } });

      const row = await tx.benefit.create({
        data: {
          code,
          ...fields,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });

      await recordAuditLog(tx, {
        entityType: "Benefit",
        entityId: String(row.id),
        action: "CREATE",
        actorId,
        data: {
          code,
          actorEmail,
          next: fields as unknown as Prisma.InputJsonValue,
        },
      });

      return { id: row.id, code: row.code };
    });

  try {
    return await attempt();
  } catch (e) {
    // Two admins creating at once can compute the same next code; the unique
    // constraint on code turns the loser into a P2002. One retry recomputes
    // against the winner's committed row.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return attempt();
    }
    throw e;
  }
}

export async function updateCatalogueBenefitAction(input: {
  benefitId: number;
  benefit: CatalogueBenefitInput;
}): Promise<void> {
  const { actorId, actorEmail } = await getActor();

  await prisma.$transaction(async (tx) => {
    const before = await getBenefitAuditSnapshot(tx, input.benefitId);
    if (!before) throw new Error("Benefit not found.");

    const fields = await validateBenefitInput(tx, input.benefit, before.code);

    await tx.benefit.update({ where: { id: input.benefitId }, data: fields });

    const after = await getBenefitAuditSnapshot(tx, input.benefitId);
    const changes = before && after ? diffBenefitSnapshots(before, after) : {};

    // No-op saves are not audited, so the trail only contains actual changes.
    if (Object.keys(changes).length) {
      await recordAuditLog(tx, {
        entityType: "Benefit",
        entityId: String(input.benefitId),
        action: "UPDATE",
        actorId,
        data: {
          code: before.code,
          actorEmail,
          changes: changes as Prisma.InputJsonValue,
        },
      });
    }
  });
}

// Retire and restore are the same audited isActive flip; separate exports so
// call sites read as what they do. Both are UPDATE in the audit trail
// (decision 5): the entity still exists either way.
async function setBenefitActive(benefitId: number, isActive: boolean) {
  const { actorId, actorEmail } = await getActor();

  await prisma.$transaction(async (tx) => {
    const before = await getBenefitAuditSnapshot(tx, benefitId);
    if (!before) throw new Error("Benefit not found.");

    // Already in the requested state: nothing to write, nothing to audit.
    if (before.isActive === isActive) return;

    await tx.benefit.update({ where: { id: benefitId }, data: { isActive } });

    await recordAuditLog(tx, {
      entityType: "Benefit",
      entityId: String(benefitId),
      action: "UPDATE",
      actorId,
      data: {
        code: before.code,
        actorEmail,
        changes: {
          benefit: {
            previous: { isActive: before.isActive },
            next: { isActive },
          },
        },
      },
    });
  });
}

export async function retireCatalogueBenefitAction(input: {
  benefitId: number;
}): Promise<void> {
  await setBenefitActive(input.benefitId, false);
}

export async function restoreCatalogueBenefitAction(input: {
  benefitId: number;
}): Promise<void> {
  await setBenefitActive(input.benefitId, true);
}
