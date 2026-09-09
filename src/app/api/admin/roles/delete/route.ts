import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

type SessionUser = {
  id?: string;
  email?: string | null;
  roleKeys?: string[];
};

type Body = {
  roleKey?: string;
};

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as SessionUser | undefined;
  if (!me?.id || !me.roleKeys?.includes("ADMIN")) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const roleKey = String(body.roleKey ?? "").trim().toUpperCase();
  if (!roleKey) {
    return NextResponse.json({ ok: false, error: "A role is required." }, { status: 400 });
  }

  if (roleKey === "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "The ADMIN role cannot be deleted." },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { key: roleKey },
        select: { id: true, key: true, label: true },
      });

      if (!role) {
        throw Object.assign(new Error("This role no longer exists."), {
          code: "ROLE_NOT_FOUND",
        });
      }

      const assignedUserCount = await tx.userRole.count({ where: { roleId: role.id } });

      await recordAuditLog(tx, {
        entityType: "Role",
        entityId: String(role.id),
        action: "DELETE",
        actorId: String(me.id),
        data: {
          roleId: role.id,
          roleKey: role.key,
          roleLabel: role.label,
          unassignedUserCount: assignedUserCount,
          actorEmail: session?.user?.email ?? null,
        },
      });

      await tx.userRole.deleteMany({ where: { roleId: role.id } });
      await tx.appAccessRule.deleteMany({ where: { roleId: role.id } });
      await tx.role.delete({ where: { id: role.id } });

      return { unassignedUserCount: assignedUserCount };
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code === "ROLE_NOT_FOUND" || code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "This role no longer exists." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not delete the role." },
      { status: 400 },
    );
  }
}
