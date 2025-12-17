// src/app/api/account/update-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { parseUkDateOrNull, uniqueOrganisationSlug } from "@/lib/admin-helpers";

export const dynamic = "force-dynamic";

function looksLikeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseNullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  let wasAdmin = false;
  if (isAdmin && editingSelf) {
    const prev = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { roles: { select: { role: { select: { key: true } } } } },
    });
    wasAdmin = (prev?.roles ?? []).some((r) => r.role.key === "ADMIN");
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
          const type = String(o.type ?? "").trim();
          const clientId = String(o.clientId ?? "").trim();

          if (!clientId || !name) throw new Error("Pending organisation is invalid.");
          if (!["UNIVERSITY", "INDUSTRY", "OTHER"].includes(type)) {
            throw new Error("Organisation type is invalid.");
          }

          const slug = await uniqueOrganisationSlug(name);
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

      // 3) Update user record
      const userUpdate: any = { firstName, lastName, email };

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

      // 5) Update single membership (admin only, only if tier is set)
      if (isAdmin && admin?.membership && resolvedMembershipTierId) {
        const expiry = parseUkDateOrNull(admin.membership.expiryText);

        // membership requires an organisation
        const targetUser = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { organisationId: true },
        });

        if (!targetUser?.organisationId) {
          throw new Error("To assign a membership tier, the user must have an organisation set.");
        }

        const existingMembership = await tx.membership.findFirst({
          where: { userId: targetUserId, isActive: true },
          select: { id: true },
        });

        const status = String(admin.membership.status ?? "active");
        const managerName = admin.membership.managerName ? String(admin.membership.managerName) : null;
        const isActive = Boolean(admin.membership.isActive);

        if (existingMembership) {
          await tx.membership.update({
            where: { id: existingMembership.id },
            data: {
              organisationId: targetUser.organisationId,
              membershipTierId: resolvedMembershipTierId,
              isActive,
              status,
              managerName,
              expiry,
            },
          });
        } else {
          await tx.membership.create({
            data: {
              userId: targetUserId,
              organisationId: targetUser.organisationId,
              membershipTierId: resolvedMembershipTierId,
              isActive,
              status,
              managerName,
              expiry,
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
