// src/app/api/account/update-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import type { Prisma } from "@prisma/client";
import { recordAuditLog, type AuditLogClient } from "@/lib/audit-log";
import {
  parseOrganisationType,
  parseUkDateOrNull,
  uniqueOrganisationSlug,
} from "@/lib/admin-helpers";

export const dynamic = "force-dynamic";

function looksLikeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseNullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// State captured before and after the save; the audit record's diff is
// computed between the two rather than reconstructed from the request body.
type UserAuditSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  isPrimaryContact: boolean;
  defaultAppId: number | null;
  organisationId: number | null;
  roleKeys: string[];
  membership: {
    membershipTierId: number;
    organisationId: number;
    isActive: boolean;
    status: string;
    managerName: string | null;
    clientExperienceManager: { id: string; name: string; email: string } | null;
    expiry: string | null;
  } | null;
};

async function getUserAuditSnapshot(
  client: AuditLogClient,
  userId: string,
): Promise<UserAuditSnapshot | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      isPrimaryContact: true,
      defaultAppId: true,
      organisationId: true,
      roles: { select: { role: { select: { key: true } } } },
      // The organisation's membership, not the contact's. Reading it per
      // contact recorded "no membership change" for anyone who did not
      // personally hold the row — i.e. every second contact at a partner.
      //
      // Unfiltered by isActive on purpose: the snapshot captures isActive
      // itself, so suspending now shows as a field change rather than as the
      // membership disappearing.
      organisation: {
        select: {
          membership: {
            select: {
              membershipTierId: true,
              organisationId: true,
              isActive: true,
              status: true,
              managerName: true,
              clientExperienceManager: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
              expiry: true,
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const membership = user.organisation?.membership ?? null;

  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    jobTitle: user.jobTitle,
    isPrimaryContact: user.isPrimaryContact,
    defaultAppId: user.defaultAppId,
    organisationId: user.organisationId,
    roleKeys: user.roles.map((r) => r.role.key).sort(),
    membership: membership
      ? {
          membershipTierId: membership.membershipTierId,
          organisationId: membership.organisationId,
          isActive: membership.isActive,
          status: membership.status,
          managerName: membership.managerName,
          // Name and email, not just the id: the audit trail should read
          // without a join against a user table that may since have changed.
          clientExperienceManager: membership.clientExperienceManager
            ? {
                id: membership.clientExperienceManager.id,
                name: `${membership.clientExperienceManager.firstName} ${membership.clientExperienceManager.lastName}`,
                email: membership.clientExperienceManager.email,
              }
            : null,
          expiry: membership.expiry ? membership.expiry.toISOString() : null,
        }
      : null,
  };
}

// Sectioned diff: only sections that actually changed appear in the result.
function diffUserSnapshots(before: UserAuditSnapshot, after: UserAuditSnapshot) {
  const changes: Record<string, unknown> = {};

  // Any new scalar on the snapshot must be listed here too, or it silently
  // vanishes from the audit diff.
  const userFields = [
    "firstName",
    "lastName",
    "email",
    "jobTitle",
    "isPrimaryContact",
    "defaultAppId",
    "organisationId",
  ] as const;
  const previousUser: Record<string, unknown> = {};
  const nextUser: Record<string, unknown> = {};
  for (const field of userFields) {
    if (before[field] !== after[field]) {
      previousUser[field] = before[field];
      nextUser[field] = after[field];
    }
  }
  if (Object.keys(nextUser).length) {
    changes.user = { previous: previousUser, next: nextUser };
  }

  const beforeRoles = new Set(before.roleKeys);
  const afterRoles = new Set(after.roleKeys);
  const rolesAdded = after.roleKeys.filter((k) => !beforeRoles.has(k));
  const rolesRemoved = before.roleKeys.filter((k) => !afterRoles.has(k));
  if (rolesAdded.length || rolesRemoved.length) {
    changes.roles = { added: rolesAdded, removed: rolesRemoved };
  }

  if (JSON.stringify(before.membership) !== JSON.stringify(after.membership)) {
    changes.membership = {
      previous: before.membership,
      next: after.membership,
    };
  }

  return changes;
}

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  if (!me?.id) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const roleKeys: string[] = me.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  const body = await req.json();

  const targetUserId: string = isAdmin ? String(body.targetUserId ?? me.id) : String(me.id);

  const userInput = body.user ?? {};
  const firstName = String(userInput.firstName ?? "").trim();
  const lastName = String(userInput.lastName ?? "").trim();
  const email = String(userInput.email ?? "").trim().toLowerCase();

  // NEW: allow defaultAppId for all users (self-edit)
  const userDefaultAppId = parseNullableNumber(userInput.defaultAppId);

  // Job titles change often and belong to the person, so this is self-editable
  // rather than admin-only. Blank is stored as null, not "".
  const jobTitleRaw = String(userInput.jobTitle ?? "").trim();
  const jobTitle = jobTitleRaw || null;

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { ok: false, error: "First name, last name, and email are required." },
      { status: 400 },
    );
  }
  if (!looksLikeEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Email address format is invalid." },
      { status: 400 },
    );
  }

  // Check uniqueness (or same user)
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== targetUserId) {
    return NextResponse.json(
      { ok: false, error: "This email is already associated with another account." },
      { status: 400 },
    );
  }

  const admin = body.admin ?? null;
  const editingSelf = targetUserId === String(me.id);

  // Pre-change snapshot: feeds the audit diff and the wasAdmin check.
  const before = await getUserAuditSnapshot(prisma, targetUserId);

  let wasAdmin = false;
  if (isAdmin && editingSelf) {
    wasAdmin = (before?.roleKeys ?? []).includes("ADMIN");
  }

  // NEW: make available outside transaction for response
  let isAdminAfterSave = wasAdmin;

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Create pending orgs/roles (if any) and build maps
      const pendingOrgIdByClientId = new Map<string, number>();
      const pendingRoleKeyByClientId = new Map<string, string>();

      if (isAdmin && admin?.pending?.organisations?.length) {
        for (const o of admin.pending.organisations) {
          const name = String(o.name ?? "").trim();
          const type = parseOrganisationType(o.type);
          const clientId = String(o.clientId ?? "").trim();

          if (!clientId || !name) throw new Error("Pending organisation is invalid.");
          if (!type) {
            throw new Error("Organisation type is invalid.");
          }

          const slug = await uniqueOrganisationSlug(name, tx);
          const created = await tx.organisation.create({
            data: { name, slug, type },
            select: { id: true },
          });

          pendingOrgIdByClientId.set(clientId, created.id);
        }
      }

      if (isAdmin && admin?.pending?.roles?.length) {
        for (const r of admin.pending.roles) {
          const key = String(r.key ?? "").trim().toUpperCase();
          const label = String(r.label ?? "").trim();
          const clientId = String(r.clientId ?? "").trim();

          if (!clientId || !key || !label) throw new Error("Pending role is invalid.");
          if (!/^[A-Z0-9_]+$/.test(key)) {
            throw new Error("Role key must be uppercase alphanumeric with underscores.");
          }

          // If it already exists, do not create a duplicate; just re-use it
          const existingRole = await tx.role.findUnique({
            where: { key },
            select: { key: true },
          });

          if (!existingRole) {
            await tx.role.create({ data: { key, label } });
          }

          pendingRoleKeyByClientId.set(clientId, key);
        }
      }

      // 2) Resolve admin selections to concrete IDs/keys
      let resolvedOrganisationId: number | null = null;
      let resolvedRoleKeys: string[] | null = null;

      // For admins, we keep admin.defaultAppId supported too,
      // but the UI now also sends user.defaultAppId, so either works.
      let resolvedDefaultAppIdForAdmin: number | null | undefined = undefined; // undefined = "no change"
      let resolvedMembershipTierId: number | null | undefined = undefined;

      if (isAdmin && admin) {
        const orgChoice = admin.organisationChoice ?? null;
        if (orgChoice) {
          if (orgChoice.kind === "existing") {
            resolvedOrganisationId = Number(orgChoice.id);
          } else if (orgChoice.kind === "pending") {
            resolvedOrganisationId = pendingOrgIdByClientId.get(String(orgChoice.clientId)) ?? null;
          }
        } else {
          resolvedOrganisationId = null;
        }

        const choices = Array.isArray(admin.roleChoices) ? admin.roleChoices : [];
        const keys: string[] = [];
        for (const c of choices) {
          if (c.kind === "existing") keys.push(String(c.key));
          if (c.kind === "pending") {
            const k = pendingRoleKeyByClientId.get(String(c.clientId));
            if (k) keys.push(k);
          }
        }
        resolvedRoleKeys = keys;

        isAdminAfterSave = resolvedRoleKeys.includes("ADMIN");

        resolvedDefaultAppIdForAdmin = parseNullableNumber(admin.defaultAppId);

        resolvedMembershipTierId =
          admin.membership?.membershipTierId == null
            ? null
            : Number(admin.membership.membershipTierId);
      } else {
        // Non-admin: session roles unchanged
        isAdminAfterSave = wasAdmin;
      }

      // Whether this save moves the contact to a different organisation.
      // Membership and primary-contact status are both organisation-wide, so
      // several decisions below turn on it.
      const organisationChanged =
        isAdmin && resolvedOrganisationId !== (before?.organisationId ?? null);

      // 3) Update user record
      const userUpdate: any = { firstName, lastName, email, jobTitle };

      // NEW: Everyone can set their own default app
      userUpdate.defaultAppId = userDefaultAppId;

      if (isAdmin) {
        // Admin can also set organisation
        userUpdate.organisationId = resolvedOrganisationId;

        // If admin explicitly set an admin defaultAppId, prefer it;
        // otherwise userDefaultAppId already covers the common case.
        if (resolvedDefaultAppIdForAdmin !== undefined) {
          userUpdate.defaultAppId = resolvedDefaultAppIdForAdmin;
        }

        // At most one primary contact per organisation. The incumbent is
        // demoted first: the partial unique index rejects a second true, and
        // promoting someone should visibly displace whoever held it.
        //
        // Demoted against the *new* organisation, not the old one — moving a
        // primary contact between organisations would otherwise carry the flag
        // across and collide with the destination's existing primary. A contact
        // with no organisation cannot be anyone's primary contact.
        // Only touched when the caller actually sent the field, so a partial
        // admin payload cannot silently demote an organisation's contact.
        if (typeof admin?.isPrimaryContact === "boolean") {
          const wantsPrimary =
            admin.isPrimaryContact && resolvedOrganisationId != null;

          if (wantsPrimary) {
            await tx.user.updateMany({
              where: {
                organisationId: resolvedOrganisationId,
                id: { not: targetUserId },
                isPrimaryContact: true,
              },
              data: { isPrimaryContact: false },
            });
          }

          userUpdate.isPrimaryContact = wantsPrimary;
        } else if (organisationChanged) {
          // The field was omitted but the contact is moving. Left alone they
          // would carry primary status into the destination, where the partial
          // unique index rejects it and fails the whole transaction with a raw
          // Prisma error. Primary status is per organisation, so a move clears
          // it: the destination's admin re-assigns deliberately.
          userUpdate.isPrimaryContact = false;
        }
      }

      await tx.user.update({
        where: { id: targetUserId },
        data: userUpdate,
      });

      // 4) Update roles (admin only)
      if (isAdmin && resolvedRoleKeys) {
        const roles = await tx.role.findMany({
          where: { key: { in: resolvedRoleKeys } },
          select: { id: true },
        });

        await tx.userRole.deleteMany({ where: { userId: targetUserId } });

        if (roles.length) {
          await tx.userRole.createMany({
            data: roles.map((r) => ({ userId: targetUserId, roleId: r.id })),
          });
        }
      }

      // 5) Update the organisation's membership (admin only, only if tier is set)
      //
      // Skipped entirely when this save moves the contact to a different
      // organisation. The membership fields in the payload were loaded from the
      // contact's *old* organisation, and the upsert below keys on the new one —
      // so writing them would overwrite the destination's tier, status, manager
      // and expiry with the origin's, for every contact there at once, while
      // leaving the origin untouched. A contact who moves simply inherits the
      // destination's membership; changing it is a separate, deliberate edit.
      if (
        isAdmin &&
        admin?.membership &&
        resolvedMembershipTierId &&
        !organisationChanged
      ) {
        const expiry = parseUkDateOrNull(admin.membership.expiryText);

        // membership requires an organisation
        const targetUser = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { organisationId: true },
        });

        if (!targetUser?.organisationId) {
          throw new Error("To assign a membership tier, the user must have an organisation set.");
        }

        // Client experience managers are assigned from the platform's admins.
        // Re-validated only when the assignment changes, so an admin who was
        // demoted after being assigned does not block unrelated saves.
        const rawCemId = admin.membership.clientExperienceManagerId;
        const cemId =
          typeof rawCemId === "string" && rawCemId.trim() ? rawCemId.trim() : null;
        let cemUser: { id: string; firstName: string; lastName: string } | null = null;
        if (cemId) {
          cemUser = await tx.user.findFirst({
            where: { id: cemId, roles: { some: { role: { key: "ADMIN" } } } },
            select: { id: true, firstName: true, lastName: true },
          });
          if (!cemUser) {
            if (cemId !== (before?.membership?.clientExperienceManager?.id ?? null)) {
              throw new Error("The client experience manager must be an admin user.");
            }
            // Unchanged but since demoted: keep the assignment (null if deleted).
            cemUser = await tx.user.findUnique({
              where: { id: cemId },
              select: { id: true, firstName: true, lastName: true },
            });
          }
        }

        const membershipFields = {
          membershipTierId: resolvedMembershipTierId,
          isActive: Boolean(admin.membership.isActive),
          status: String(admin.membership.status ?? "active"),
          clientExperienceManagerId: cemUser?.id ?? null,
          // Transitional mirror of the relation, so consumers still reading
          // the free-text column stay truthful. Removed with the column drop.
          managerName: cemUser ? `${cemUser.firstName} ${cemUser.lastName}` : null,
          expiry,
        };

        // Keyed on the organisation, so editing any contact edits the one
        // membership their organisation holds.
        //
        // This previously looked the row up per contact and fell through to a
        // create when it found none, which broke in two ways: saving a second
        // contact's profile violated the unique organisationId, and
        // reactivating a suspended member (whose own row the isActive filter
        // hid) silently created a duplicate.
        await tx.membership.upsert({
          where: { organisationId: targetUser.organisationId },
          create: {
            organisationId: targetUser.organisationId,
            ...membershipFields,
          },
          update: membershipFields,
        });
      }

      // 6) Audit record: one row per save, skipped when nothing changed.
      const after = await getUserAuditSnapshot(tx, targetUserId);
      if (before && after) {
        const changes = diffUserSnapshots(before, after);
        if (Object.keys(changes).length) {
          await recordAuditLog(tx, {
            entityType: "User",
            entityId: targetUserId,
            action: "UPDATE",
            actorId: String(me.id),
            data: {
              targetUserId,
              targetEmail: after.email,
              actorEmail: session?.user?.email ?? null,
              changes: changes as Prisma.InputJsonValue,
            },
          });
        }
      }
    });

    const adminDemoted = editingSelf && wasAdmin && !isAdminAfterSave;

    return NextResponse.json({ ok: true, adminDemoted }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Could not save changes." },
      { status: 400 },
    );
  }
}
