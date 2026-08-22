// src/app/membership-dashboard/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import {
  getAdminDashboardSummary,
  getMemberDashboardData,
} from "@/lib/membership-dashboard";
import {
  getAdminBenefitAuditTrail,
  getAdminBenefitRedemptionStats,
  getAdminMemberList,
  getAdminSelectedMember,
  getMembershipTierOptions,
} from "@/lib/membership-dashboard-admin";
import { renderHandbookChapterBySlug } from "@/lib/handbook";
import AdminDashboard from "@/components/membership-dashboard/AdminDashboard";
import MemberDashboard from "@/components/membership-dashboard/MemberDashboard";
import SignInForm from "@/components/SignInForm";
import { pageCopy } from "@/content/pageCopy";
import { userCanAccessApp } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import {
  getBenefitActionProgressForOrganisation,
  getBenefitActionProgressPartnerCounts,
  getBenefitCatalogue,
  getBenefitCatalogueForEditor,
  getBenefitPartnerNotesForOrganisation,
  getOpenBenefitRequestsForOrganisation,
} from "@/lib/benefits";

type Props = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function pickFirst(v: string | string[] | undefined) {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function computeRevenueFromTiers(tiers: { key: string; label: string; count: number }[]) {
  const price = (tierKeyOrLabel: string) => {
    const k = tierKeyOrLabel.toLowerCase();
    if (k.includes("platinum")) return 30000;
    if (k.includes("gold")) return 15000;
    if (k.includes("silver")) return 5000;
    return 0;
  };

  return tiers.reduce((sum, t) => {
    const p = price(`${t.key} ${t.label}`);
    return sum + p * t.count;
  }, 0);
}

export default async function MembershipDashboardPage(props: Props) {
  const copy = pageCopy.membershipDashboard;
  const session = await getServerAuthSession();
  const sp = props.searchParams ? await props.searchParams : undefined;

  // 1) Not signed in → public description + sign-in form
  if (!session || !session.user) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>

        {copy.unauthenticatedIntro && <p>{copy.unauthenticatedIntro}</p>}

        <SignInForm defaultRedirect="/membership-dashboard" />
      </section>
    );
  }

  const userId = (session.user as any).id as string;
  const roleKeys = ((session.user as any).roleKeys ?? []) as string[];
  const isAdmin = roleKeys.includes("ADMIN");

  // 2) Enforce app access rules (for non-admin users)
  if (!isAdmin) {
    const canAccess = await userCanAccessApp(userId, "MEMBERSHIP_DASHBOARD");
    if (!canAccess) {
      redirect(
        "/access-denied?reason=access-denied&appKey=MEMBERSHIP_DASHBOARD",
      );
    }
  }

  // 3) Admin view
  if (isAdmin) {
    const selectedUserId = pickFirst(sp?.userId) ?? null;
    const tab = pickFirst(sp?.tab) ?? null; // "members" | "benefits" | "handbook"
    const chapter = pickFirst(sp?.chapter) ?? null;

    // Resolved before the batch because the redemption stats are computed from
    // it; the client component receives the same list.
    const benefits = await getBenefitCatalogue(prisma);

    const [
      summary,
      members,
      selectedMember,
      benefitStats,
      handbook,
      totalUsers,
      editorBenefits,
      tierOptions,
    ] = await Promise.all([
      getAdminDashboardSummary(),
      getAdminMemberList(),
      selectedUserId
        ? getAdminSelectedMember(selectedUserId)
        : Promise.resolve(null),
      getAdminBenefitRedemptionStats(benefits),
      renderHandbookChapterBySlug(chapter ?? undefined),
      prisma.user.count(),
      // The editor's own shape: retired benefits included, database ids and
      // step rows surfaced. Member-facing consumers keep the list above.
      getBenefitCatalogueForEditor(prisma),
      getMembershipTierOptions(),
    ]);

    // Feeds the editor's step-deletion warning: how many partners' progress
    // rows cascade away with each step.
    const stepProgressCounts = await getBenefitActionProgressPartnerCounts(prisma);

    // The trail belongs to the organisation, so it needs the selected member's
    // organisation and cannot join the batch above.
    const benefitAuditTrail = selectedMember?.organisationId
      ? await getAdminBenefitAuditTrail(selectedMember.organisationId)
      : [];

    // Same shape for the partner's benefit notes and step progress:
    // organisation-scoped, so resolvable only once a member is selected.
    const partnerNotes = selectedMember?.organisationId
      ? await getBenefitPartnerNotesForOrganisation(
          prisma,
          selectedMember.organisationId,
        )
      : {};

    const partnerProgress = selectedMember?.organisationId
      ? await getBenefitActionProgressForOrganisation(
          prisma,
          selectedMember.organisationId,
        )
      : {};

    // The partner's open benefit requests, resolved once here and threaded
    // down — never re-resolved further down the tree on this force-dynamic,
    // connection_limit=1 page.
    const partnerOpenRequests = selectedMember?.organisationId
      ? await getOpenBenefitRequestsForOrganisation(
          prisma,
          selectedMember.organisationId,
        )
      : {};

    const payingRevenue = computeRevenueFromTiers(summary.tiers);

    const top = benefitStats
      .filter((s) => s.eligible > 0)
      .slice()
      .sort((a, b) => {
        // primary: % redeemed, secondary: redeemed count
        const ap = a.percent ?? -1;
        const bp = b.percent ?? -1;
        if (bp !== ap) return bp - ap;
        return b.redeemed - a.redeemed;
      })[0];

    const topBenefitLabel =
      top
        ? benefits.find((b) => b.id === top.benefitId)?.label ?? "Unknown benefit"
        : "Unknown benefit";

    return (
      <AdminDashboard
        {...summary}
        totalUsers={totalUsers}
        payingRevenue={payingRevenue}
        mostUtilisedBenefitLabel={topBenefitLabel}
        title={copy.adminTitle ?? copy.title}
        intro={copy.adminIntro}
        members={members}
        selectedUserId={selectedUserId}
        selectedMember={selectedMember}
        benefits={benefits}
        editorBenefits={editorBenefits}
        tierOptions={tierOptions}
        benefitStats={benefitStats}
        benefitAuditTrail={benefitAuditTrail}
        partnerNotes={partnerNotes}
        partnerProgress={partnerProgress}
        partnerOpenRequests={partnerOpenRequests}
        stepProgressCounts={stepProgressCounts}
        initialTab={tab}
        handbook={handbook}
      />
    );
  }

  // 4) Member view
  const memberData = await getMemberDashboardData(userId);

  if (!memberData) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
        </header>
        <p>We could not find your user record.</p>
      </section>
    );
  }

  const benefits = await getBenefitCatalogue(prisma);

  return <MemberDashboard {...memberData} benefits={benefits} />;
}
