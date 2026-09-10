// src/app/ixn-workflow-manager/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { userCanAccessApp } from "@/lib/access-control";
import { getAppByKey, resolveAppDestination } from "@/lib/apps";
import { prisma } from "@/lib/prisma";
import SignInForm from "@/components/SignInForm";
import { pageCopy } from "@/content/pageCopy";
import { ixnApp } from "@/content/ixnApp";

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
    redirect(
      "/access-denied?reason=access-denied&appKey=IXN_WORKFLOW_MANAGER",
    );
  }

  // Resolved only after the access check: an unauthorised user is redirected
  // above and never pays for the read.
  const app = await getAppByKey(prisma, "IXN_WORKFLOW_MANAGER");
  const destination = app ? resolveAppDestination(app) : null;

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title}</h1>
      </header>

      <p>{copy.description}</p>

      {destination && (
        <>
          <p>
            <a
              className="button-link button-link--primary"
              href={destination}
              target="_blank"
              rel="noreferrer"
            >
              {ixnApp.ctaLabel}
            </a>
          </p>
          <p className="small">{ixnApp.note}</p>
        </>
      )}
    </section>
  );
}
