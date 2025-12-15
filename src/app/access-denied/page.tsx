// src/app/access-denied/page.tsx
import Link from "next/link";
import { services } from "@/content/services";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParamsObject = {
  [key: string]: string | string[] | undefined;
};

type AccessDeniedPageProps = {
  searchParams: Promise<SearchParamsObject>;
};

function getFirst(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccessDeniedPage(
  { searchParams }: AccessDeniedPageProps,
) {
  // In Next 16, searchParams is a Promise of a plain object
  const sp = await searchParams;

  const reasonRaw = getFirst(sp.reason);
  const reason = reasonRaw?.toLowerCase();
  const serviceSlug = getFirst(sp.service);
  const appKey = getFirst(sp.appKey);

  // For the debug block, we can just dump the object
  const debugParams: Record<string, string | string[] | undefined> = { ...sp };

  // ─────────────────────────────────────────────
  // 1) "Coming soon" branch (service-level)
  // ─────────────────────────────────────────────
  if (reason === "coming-soon") {
    const service = serviceSlug
      ? services.find((s) => s.slug === serviceSlug)
      : undefined;

    const label = service?.title ?? "this service";

    return (
      <section className="content-section">
        <header className="content-header">
          <h1>Coming soon…</h1>
        </header>

        <p>
          Thank you for contributing to our site analytics data. You tried to
          access <strong>{label}</strong>. This service is currently
          unavailable or has not yet been developed. If we see that many other
          people show an interest in this service by clicking the link you just
          did, we will prioritise deployment.
        </p>

        <p>
          In the meantime, you can review our{" "}
          <Link href="/release-notes">release notes</Link>{" "}
          to see current progress and our roadmap.
        </p>

        {/* TEMP: Debug block – remove once everything works 
        <hr />
        <pre aria-label="Debug info">
          {JSON.stringify(
            { searchParams: debugParams, reasonRaw, serviceSlug, appKey },
            null,
            2,
          )}
        </pre>
*/}
      </section>
    );
  }

  // ─────────────────────────────────────────────
  // 2) Role / membership-based app access denied
  // ─────────────────────────────────────────────
  const session = await getServerAuthSession();
  const user = session?.user as any | undefined;

  const userRoles: string[] = user?.roleKeys ?? [];
  const userTierKey: string | null = user?.membershipTierKey ?? null;

  let requiredTierLabel: string | null = null;

  // Try to look up app and tier requirement if appKey was provided
  let appLabelFallback =
    appKey?.replace(/_/g, " ").toLowerCase() ??
    "this part of the Alliances Platform";

  let appLabel = appLabelFallback;

  if (appKey) {
    const app = await prisma.app.findUnique({
      where: { key: appKey },
      include: {
        appAccessRules: {
          include: { minMembershipTier: true },
        },
      },
    });

    // Prefer App.name as label if known
    if (app?.name) {
      appLabel = app.name;
    }

// DO NOT fall back to service titles for app-level access
// App.name should be the authoritative label
// If App.name is missing (should never happen), fallback to humanised appKey
if (!appLabel || appLabel === appLabelFallback) {
  appLabel = app?.name ?? appLabelFallback;
}

    if (app?.appAccessRules?.length) {
      const allowRules = app.appAccessRules.filter(
        (r) => r.accessType === "ALLOW" && r.minMembershipTier,
      );

      if (allowRules.length) {
        const minRule = allowRules.reduce((best, rule) => {
          if (!best) return rule;
          if (!rule.minMembershipTier || !best.minMembershipTier) return best;
          return rule.minMembershipTier.rank < best.minMembershipTier.rank
            ? rule
            : best;
        }, allowRules[0]);

        if (minRule.minMembershipTier) {
          requiredTierLabel = minRule.minMembershipTier.label;
        }
      }
    }
  }

  // Tailored reasons
  let heading = "Access denied";
  let body: JSX.Element;

if (reason === "register-admin-only") {
  heading = "Register – admin access required";
  body = (
    <>
      <p>
        You selected <strong>Register</strong>, but this option is currently
        restricted to <strong>admins</strong> for adding new users.
      </p>
      <p>
        To continue, sign in using an admin account and select{" "}
        <strong>Add user</strong> from the Account menu, or contact the
        Alliances Team if you believe you should have admin access.
      </p>
    </>
  );
}

  if (reason === "student-view-role") {
    heading = "Student view – role restricted";
    body = (
      <>
        <p>
          You tried to access the <strong>student view</strong> of{" "}
          <strong>{appLabel}</strong>, but your current role does not permit
          this. The student view is only available to users with a{" "}
          <strong>STUDENT</strong> or <strong>ADMIN</strong> role.
        </p>
        <p>
          <strong>Your roles:</strong>{" "}
          {userRoles.length ? userRoles.join(", ") : "none assigned"}
          <br />
          <strong>Your membership tier:</strong>{" "}
          {userTierKey ?? "no active tier"}
        </p>
      </>
    );
  } else if (reason === "cv-library-tier") {
    heading = "CV Library – membership upgrade required";
    body = (
      <>
        <p>
          You tried to access the <strong>CV Library</strong> within{" "}
          <strong>{appLabel}</strong>, but your current membership tier does
          not include this benefit.
        </p>
        <p>
          The CV Library is available to <strong>Gold</strong> and{" "}
          <strong>Platinum</strong> members.
        </p>
        <p>
          <strong>Your roles:</strong>{" "}
          {userRoles.length ? userRoles.join(", ") : "none assigned"}
          <br />
          <strong>Your membership tier:</strong>{" "}
          {userTierKey ?? "no active tier"}
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p>
          You tried to access <strong>{appLabel}</strong>, but your current
          account does not meet the access requirements.
        </p>

        <p>
          <strong>Your roles:</strong>{" "}
          {userRoles.length ? userRoles.join(", ") : "none assigned"}
          <br />
          <strong>Your membership tier:</strong>{" "}
          {userTierKey ?? "no active tier"}
        </p>

        {requiredTierLabel && (
          <p>
            <strong>Required membership tier:</strong>{" "}
            {requiredTierLabel} or higher.
          </p>
        )}
      </>
    );
  }

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{heading}</h1>
      </header>

      {body}

      <p>
        If you believe you should have access (for example, you have recently
        been assigned a different role or your organisation&apos;s membership
        has changed), please contact the Alliances Team to confirm your details
        or to discuss upgrading your membership.
      </p>

      {/* TEMP: Debug block – remove once everything works 
      <hr />
      <pre aria-label="Debug info">
        {JSON.stringify(
          { searchParams: debugParams, reasonRaw, serviceSlug, appKey },
          null,
          2,
        )}
      </pre>
*/}
    </section>
  );
}
