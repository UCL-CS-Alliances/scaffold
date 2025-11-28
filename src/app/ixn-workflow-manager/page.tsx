// src/app/ixn-workflow-manager/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { userCanAccessApp } from "@/lib/access-control";
import SignInForm from "@/components/SignInForm";
import { pageCopy } from "@/content/pageCopy";

export default async function IxnWorkflowManagerPage() {
  const copy = pageCopy.ixnWorkflowManager;
  const session = await getServerAuthSession();

  if (!session || !session.user) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>

        {copy.unauthenticatedIntro && <p>{copy.unauthenticatedIntro}</p>}

        <SignInForm defaultRedirect="/ixn-workflow-manager" />
      </section>
    );
  }

  const userId = (session.user as any).id as string;
  const canAccess = await userCanAccessApp(userId, "IXN_WORKFLOW_MANAGER");

  if (!canAccess) {
    redirect("/access-denied");
  }

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title}</h1>
      </header>

      <p>{copy.description}</p>
      {/* Later: actual IXN app content here */}
    </section>
  );
}
