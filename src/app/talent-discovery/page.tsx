// src/app/talent-discovery/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { userCanAccessApp } from "@/lib/access-control";
import SignInForm from "@/components/SignInForm";
import { pageCopy } from "@/content/pageCopy";

import StudentView from "@/components/talent-discovery/StudentView";
import MemberJobBoardOnlyView from "@/components/talent-discovery/MemberJobBoardOnlyView";
import MemberFullView from "@/components/talent-discovery/MemberFullView";

const TALENT_DISCOVERY_APP_KEY = "TALENT_DISCOVERY";

export default async function TalentDiscoveryPage() {
  const copy = pageCopy.talentDiscovery;
  const session = await getServerAuthSession();

  // 1) Not signed in → intro + sign-in form
  if (!session || !session.user) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>

        {copy.unauthenticatedIntro && <p>{copy.unauthenticatedIntro}</p>}

        <SignInForm defaultRedirect="/talent-discovery" />
      </section>
    );
  }

  const user = session.user as any;
  const userId = user.id as string | undefined;
  const roleKeys = ((user.roleKeys ?? []) as string[]) || [];
  const membershipTierKey = (user.membershipTierKey ?? null) as
    | string
    | null;

  if (!userId) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
        </header>
        <p>We could not find your user record.</p>
      </section>
    );
  }

  // 2) App-level access (Bronze+), via Prisma rules
  const canAccess = await userCanAccessApp(userId, TALENT_DISCOVERY_APP_KEY);
  if (!canAccess) {
    redirect("/access-denied");
  }

  // 3) Decide which "face" of Talent Discovery to show
  const isStudent = roleKeys.includes("STUDENT");
  const isMember = roleKeys.includes("MEMBER");

  const isGoldOrAbove =
    membershipTierKey === "GOLD" || membershipTierKey === "PLATINUM";
  const isBronzeOrSilver =
    membershipTierKey === "BRONZE" || membershipTierKey === "SILVER";

  // Student role always gets the student-facing view
  if (isStudent) {
    return <StudentView copy={copy} />;
  }

  // Member views based on tier
  if (isMember && isGoldOrAbove) {
    return <MemberFullView copy={copy} />;
  }

  if (isMember && isBronzeOrSilver) {
    return <MemberJobBoardOnlyView copy={copy} />;
  }

  // Fallback: allowed by app rules but no clear mapping
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title}</h1>
      </header>
      <p>
        Your account has access to Talent Discovery, but we could not determine
        which view to show based on your role and membership tier.
      </p>
      <p>
        Please contact the Strategic Alliances Team if you think this is an
        error.
      </p>
    </section>
  );
}
