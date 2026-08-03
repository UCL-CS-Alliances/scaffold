// src/app/api/account/delete-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { recordAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

type Body = {
  targetUserId?: string;
};

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as any | undefined;
  if (!me?.id) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const roleKeys: string[] = me.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  const body = (await req.json()) as Body;
  const targetUserId = String(body.targetUserId ?? "").trim();

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Target user is required." }, { status: 400 });
  }

  const deletingSelf = targetUserId === String(me.id);

  if (deletingSelf) {
    if (isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Admins cannot delete their own account." },
        { status: 403 },
      );
    }
    // Non-admin self delete is allowed
  } else {
    // deleting others requires admin
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Snapshot the target into the audit record before it disappears; the
      // row itself must be written before the delete because a self-deleting
      // user's actorId is nulled by the FK's ON DELETE SET NULL.
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { email: true, firstName: true, lastName: true },
      });

      if (target) {
        await recordAuditLog(tx, {
          entityType: "User",
          entityId: targetUserId,
          action: "DELETE",
          actorId: String(me.id),
          data: {
            targetUserId,
            targetEmail: target.email,
            targetName: `${target.firstName} ${target.lastName}`,
            actorEmail: session?.user?.email ?? null,
            selfDelete: deletingSelf,
          },
        });
      }

      // Delete dependents first. userRole and membership are ON DELETE RESTRICT,
      // so the user delete fails without this. The membership-dashboard
      // projection is ON DELETE SET NULL, so the opposite problem: left alone it
      // survives the member as an orphaned row still holding their
      // redeemedBenefitCodes and its @unique memberKey.
      await tx.membershipDashboardMember.deleteMany({ where: { userId: targetUserId } });
      await tx.userRole.deleteMany({ where: { userId: targetUserId } });
      await tx.membership.deleteMany({ where: { userId: targetUserId } });

      // Finally delete the user record
      await tx.user.delete({ where: { id: targetUserId } });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    // The target is already gone — most often a confirm dialogue submitted
    // twice. Prisma's raw P2025 text is not something to show an admin.
    if (e?.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "This user no longer exists." },
        { status: 400 },
      );
    }

    // Prisma constraint errors often surface here; return a helpful message.
    const msg =
      typeof e?.message === "string" && e.message
        ? e.message
        : "Could not delete user (possible related records preventing deletion).";

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
