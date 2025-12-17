// src/app/talent-discovery/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { userCanAccessApp } from "@/lib/access-control";
import SignInForm from "@/components/SignInForm";
import { pageCopy } from "@/content/pageCopy";

// These are the three view components we created earlier
import TalentDiscoveryStudentView from "@/components/talent-discovery/StudentView";
import TalentDiscoveryPartnerJobBoardView from "@/components/talent-discovery/PartnerJobBoardView";
import TalentDiscoveryPartnerFullView from "@/components/talent-discovery/PartnerFullView";

export const dynamic = "force-dynamic";

type SearchParamsObject = {
  [key: string]: string | string[] | undefined;
};

type TalentDiscoveryPageProps = {
  searchParams: Promise<SearchParamsObject>;
};

function getFirst(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function TalentDiscoveryPage(
  { searchParams }: TalentDiscoveryPageProps,
) {
  const sp = await searchParams;
  const view = getFirst(sp.view) ?? "default"; // "student" | "job-board" | "cv-library" | "default"

  const copy = pageCopy.talentDiscovery;
  const session = await getServerAuthSession();

  // 1) Not signed in → public description + sign-in form
  if (!session || !session.user) {
    // Preserve the intended view after sign-in if present
    const redirectSuffix = view !== "default" ? `?view=${view}` : "";
    const defaultRedirect = `/talent-discovery${redirectSuffix}`;

    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>

        {copy.unauthenticatedIntro && <p>{copy.unauthenticatedIntro}</p>}

        <SignInForm defaultRedirect={defaultRedirect} />
      </section>
    );
  }

  // 2) Extract user info from the session
  const user = session.user as any;
  const userId = user.id as string;
  const roleKeys = (user.roleKeys ?? []) as string[];
  const membershipTierRank = (user.membershipTierRank ?? null) as number | null;

  const hasStudentRole = roleKeys.includes("STUDENT");
  const hasAdminRole = roleKeys.includes("ADMIN");
  const hasMemberRole = roleKeys.includes("MEMBER");

  const SILVER_RANK = 2;
  const GOLD_RANK = 3;

  // ─────────────────────────────────────────
  // 3) Student view: only STUDENT or ADMIN
  // ─────────────────────────────────────────
  if (view === "student") {
    if (!hasStudentRole && !hasAdminRole) {
      // Logged-in but wrong role for student view
      redirect(
        "/access-denied?reason=student-view-role&appKey=TALENT_DISCOVERY",
      );
    }

    // Students/admins can access student view regardless of tier
    return (
      <TalentDiscoveryStudentView
        title={copy.title}
        description={copy.description}
      />
    );
  }

  // ─────────────────────────────────────────
  // 4) App-level gate for partner views (Silver+)
  //    Applies to job-board, cv-library, and default entries
  //
  //    Admin bypass: admins can access all partner views regardless of tier.
  // ─────────────────────────────────────────
  if (!hasAdminRole) {
    const canAccessApp = await userCanAccessApp(userId, "TALENT_DISCOVERY");
    if (!canAccessApp) {
      redirect(
        "/access-denied?reason=access-denied&appKey=TALENT_DISCOVERY",
      );
    }
  }

  // ─────────────────────────────────────────
  // 5) CV Library entry: requires Gold+ tier
  //    Admin bypass: admin can always access.
  // ─────────────────────────────────────────
  if (view === "cv-library") {
    if (!hasAdminRole) {
      if (
        membershipTierRank == null ||
        membershipTierRank < GOLD_RANK ||
        !hasMemberRole
      ) {
        // Member below Gold, or not a member at all
        redirect(
          "/access-denied?reason=cv-library-tier&appKey=TALENT_DISCOVERY",
        );
      }
    }

    // Gold/Platinum member OR admin → full partner view (job board + CV Library)
    return (
      <TalentDiscoveryPartnerFullView
        title={copy.title}
        description={copy.description}
      />
    );
  }

  // ─────────────────────────────────────────
  // 6) Job board or default entry for partners
  //    Admin bypass: admin always sees full view (all partner capabilities).
  // ─────────────────────────────────────────
  if (hasAdminRole) {
    return (
      <TalentDiscoveryPartnerFullView
        title={copy.title}
        description={copy.description}
      />
    );
  }

  if (
    membershipTierRank != null &&
    membershipTierRank >= GOLD_RANK &&
    hasMemberRole
  ) {
    // Gold+ from any non-student entry → full view
    return (
      <TalentDiscoveryPartnerFullView
        title={copy.title}
        description={copy.description}
      />
    );
  }

  if (
    membershipTierRank != null &&
    membershipTierRank >= SILVER_RANK &&
    hasMemberRole
  ) {
    // Silver members → job board only
    return (
      <TalentDiscoveryPartnerJobBoardView
        title={copy.title}
        description={copy.description}
      />
    );
  }

  // ─────────────────────────────────────────
  // 7) Fallback – should rarely be reached
  // ─────────────────────────────────────────
  redirect(
    "/access-denied?reason=access-denied&appKey=TALENT_DISCOVERY",
  );
}
