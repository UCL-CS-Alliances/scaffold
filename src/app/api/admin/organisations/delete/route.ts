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
  organisationId?: number | string;
};

export async function POST(req: Request) {
  const session = await getServerAuthSession();
  const me = session?.user as SessionUser | undefined;
  if (!me?.id || !me.roleKeys?.includes("ADMIN")) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const organisationId = Number(body.organisationId);
  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    return NextResponse.json(
      { ok: false, error: "A valid organisation is required." },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true, name: true },
      });

      if (!organisation) {
        throw Object.assign(new Error("This organisation no longer exists."), {
          code: "ORG_NOT_FOUND",
        });
      }

      const assignedUserCount = await tx.user.count({ where: { organisationId } });

      await recordAuditLog(tx, {
        entityType: "Organisation",
        entityId: String(organisation.id),
        action: "DELETE",
        actorId: String(me.id),
        data: {
          organisationId: organisation.id,
          organisationName: organisation.name,
          unassignedUserCount: assignedUserCount,
          actorEmail: session?.user?.email ?? null,
        },
      });

      // Preserve users, but remove the organisation-specific assignment before
      // deleting the organisation and its organisation-owned records.
      await tx.user.updateMany({
        where: { organisationId },
        data: { organisationId: null, isPrimaryContact: false },
      });

      await tx.membership.deleteMany({ where: { organisationId } });
      await tx.membershipDashboardMember.deleteMany({ where: { organisationId } });
      await tx.benefitActionProgress.deleteMany({ where: { organisationId } });
      await tx.benefitPartnerNote.deleteMany({ where: { organisationId } });
      await tx.benefitRedemptionRequest.deleteMany({ where: { organisationId } });
      await tx.organisation.delete({ where: { id: organisationId } });

      return { unassignedUserCount: assignedUserCount };
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code === "ORG_NOT_FOUND" || code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "This organisation no longer exists." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not delete the organisation." },
      { status: 400 },
    );
  }
}
