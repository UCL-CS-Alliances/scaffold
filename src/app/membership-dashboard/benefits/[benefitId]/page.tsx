import { notFound } from "next/navigation";
import Link from "next/link";
import { BENEFITS, type Benefit } from "@/content/benefits";
import {
  getSupersedingBenefit,
  hasBenefitAccess,
  resolveMemberRank,
} from "@/lib/benefit-access";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { getMemberDashboardData } from "@/lib/membership-dashboard";
import SecondaryNav from "@/components/membership-dashboard/SecondaryNav";

type PageProps = {
  params: Promise<{ benefitId: string }>;
};

type BenefitStatus = "REDEEMED" | "SUPERSEDED" | "HAS_ACCESS" | "NO_ACCESS";

// Precedence matters: a superseded benefit the member has already redeemed is
// still reported as redeemed, and tier access is still checked first, so the
// only status this adds is "eligible, unredeemed, but replaced by a better one".
function determineStatus(
  hasAccess: boolean,
  isRedeemed: boolean,
  isSuperseded: boolean,
): BenefitStatus {
  if (!hasAccess) return "NO_ACCESS";
  if (isRedeemed) return "REDEEMED";
  if (isSuperseded) return "SUPERSEDED";
  return "HAS_ACCESS";
}

function getStatusMeta(status: BenefitStatus) {
  switch (status) {
    case "REDEEMED":
      return { symbol: "✅", label: "Redeemed" };
    case "SUPERSEDED":
      return { symbol: "⬆️", label: "Replaced by an upgraded benefit" };
    case "HAS_ACCESS":
      return { symbol: "🟡", label: "Available" };
    case "NO_ACCESS":
    default:
      return { symbol: "🔒", label: "Not included in your tier" };
  }
}

// Support both legacy array process and the newer structured process object
type ProcessObject = {
  trigger?: string;
  actions?: string[];
  outcome?: string;
};

function isProcessObject(value: unknown): value is ProcessObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export default async function BenefitPage({ params }: PageProps) {
  const { benefitId } = await params;

  const id = benefitId?.toUpperCase().trim();
  if (!id) notFound();

  const benefit = BENEFITS.find((b) => b.id === id);
  if (!benefit) notFound();

  // Default assumptions: not logged in / no membership data
  let hasAccess = false;
  let isRedeemed = false;
  // The benefit that replaces this one for this member, if any. The member
  // dashboard hides superseded benefits from its list, so without this the page
  // is only reachable by direct URL — and used to present a replaced benefit as
  // available, with a process to follow that no longer applies.
  let supersededBy: Benefit | null = null;

  const session = await getServerAuthSession();

  if (session?.user?.id) {
    const userId = session.user.id;

    const memberData = await getMemberDashboardData(userId);
    if (memberData) {
      const myRank = resolveMemberRank(
        memberData.membershipTierRank,
        memberData.membershipTierKey,
      );

      hasAccess = hasBenefitAccess(myRank, benefit.tierMin);
      isRedeemed = memberData.redeemedBenefitCodes.includes(id);
      supersededBy = getSupersedingBenefit(myRank, benefit.id);
    }
  }

  const status = determineStatus(hasAccess, isRedeemed, supersededBy != null);
  const { symbol, label } = getStatusMeta(status);

  const backHref = "/membership-dashboard/";

  const processValue = benefit.process as unknown;

  const processAsObject = isProcessObject(processValue)
    ? (processValue as ProcessObject)
    : null;

  const processAsArray = Array.isArray(processValue)
    ? (processValue as string[])
    : null;

  return (
    <section className="content-section">
      <header className="content-header benefit-detail-header">
        <h1>{benefit.label}</h1>
        <p className="benefit-detail-description">{benefit.description}</p>
      </header>

      {/* Secondary navigation (same as member dashboard) */}
      <SecondaryNav />

      {/* Status */}
      <section className="benefit-status" style={{ marginTop: "1rem" }}>
        <h2>
          Status: {label} {symbol}
        </h2>

        {status === "REDEEMED" && (
          <>
            <p>
              This benefit has already been redeemed under your current
              membership. If you believe this is incorrect, please contact the
              Strategic Alliances team.
            </p>

            <p style={{ marginTop: "1.25rem" }}>
              <Link
                href={backHref}
                className="button-link button-link--secondary"
              >
                Back to benefits list
              </Link>
            </p>
          </>
        )}

        {status === "SUPERSEDED" && supersededBy && (
          <>
            <p>
              Your membership tier includes {supersededBy.label}, which replaces
              this benefit. Arrange that instead — there is no need to request
              this one separately.
            </p>

            <p style={{ marginTop: "1.25rem" }}>
              <Link
                href={`/membership-dashboard/benefits/${supersededBy.id}`}
                className="button-link button-link--primary"
                style={{ marginRight: "0.75rem" }}
              >
                Go to {supersededBy.label}
              </Link>

              <Link
                href={backHref}
                className="button-link button-link--secondary"
              >
                Back to benefits list
              </Link>
            </p>
          </>
        )}

        {status === "NO_ACCESS" && (
          <>
            <p>
              This benefit is not included in your membership tier. Please
              consider upgrading your membership and scheduling a call with your
              client experience manager to discuss options.
            </p>

            <p style={{ marginTop: "1.25rem" }}>
              <Link
                href="/membership-dashboard/upgrade"
                className="button-link button-link--primary"
                style={{ marginRight: "0.75rem" }}
              >
                Explore membership upgrade options
              </Link>

              <Link
                href="/membership-dashboard/book-client-experience-call"
                className="button-link button-link--primary"
                style={{ marginRight: "0.75rem" }}
              >
                Schedule a call
              </Link>

              <Link
                href={backHref}
                className="button-link button-link--secondary"
              >
                Back to benefits list
              </Link>
            </p>
          </>
        )}

        {status === "HAS_ACCESS" && (
          <p>
            You have access to this benefit and have not yet redeemed it.
            Coordinate next steps with your client experience manager.
          </p>
        )}
      </section>

      {/* HAS ACCESS ONLY: process + terms */}
      {status === "HAS_ACCESS" && (
        <>
          {/* Process */}
          {(processAsObject || (processAsArray && processAsArray.length > 0)) && (
            <section className="benefit-process" style={{ marginTop: "1.5rem" }}>
              <h2>How this benefit works</h2>
              <p>To redeem this benefit, follow the process outlined below.</p>

              {/* New structured process */}
              {processAsObject && (
                <>
                  {processAsObject.trigger && (
                    <section style={{ marginTop: "1rem" }}>
                      <h3>Trigger</h3>
                      <p>{processAsObject.trigger}</p>
                      <button
                        type="button"
                        className="button-link button-link--primary"
                        disabled
                        aria-disabled="true"
title="This action will be enabled in a future release."
                        style={{ marginTop: "0.5rem" }}
                      >
                        Redeem benefit now
                      </button>
                    </section>
                  )}

                  {processAsObject.actions && processAsObject.actions.length > 0 && (
                    <section style={{ marginTop: "1.25rem" }}>
                      <h3>Actions</h3>
                      <ul>
                        {processAsObject.actions.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {processAsObject.outcome && (
                    <section style={{ marginTop: "1.25rem" }}>
                      <h3>Outcome</h3>
                      <p>{processAsObject.outcome}</p>
                      <button
                        type="button"
                        className="button-link button-link--primary"
                        disabled
                        aria-disabled="true"
title="This action will be enabled in a future release."
                        style={{ marginTop: "0.5rem" }}
                      >
                        Launch partner satisfaction survey
                      </button>
                    </section>
                  )}
                </>
              )}

              {/* Legacy array process (fallback) */}
              {processAsArray && (
                <ul style={{ marginTop: "1rem" }}>
                  {processAsArray.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Terms */}
          {benefit.terms && benefit.terms.length > 0 && (
            <section style={{ marginTop: "1.5rem" }}>
              <h2>Terms and conditions</h2>
              <ol>
                {benefit.terms.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ol>
            </section>
          )}

          <section style={{ marginTop: "2rem" }}>
            <Link
              href={backHref}
              className="button-link button-link--secondary"
            >
              Back to benefits list
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
