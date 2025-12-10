// src/app/membership-dashboard/benefits/[benefitId]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BENEFITS,
  MEMBERSHIP_TIER_RANK,
  MembershipTierKey,
} from "@/content/benefits";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { getMemberDashboardData } from "@/lib/membership-dashboard";

type PageProps = {
  params: Promise<{ benefitId: string }>;
};

type BenefitStatus = "REDEEMED" | "HAS_ACCESS" | "NO_ACCESS";

function determineStatus(hasAccess: boolean, isRedeemed: boolean): BenefitStatus {
  if (!hasAccess) return "NO_ACCESS";
  if (isRedeemed) return "REDEEMED";
  return "HAS_ACCESS";
}

function normaliseTierKey(key: string | null): MembershipTierKey | null {
  if (!key) return null;
  const lower = key.toLowerCase() as MembershipTierKey;
  return ["bronze", "silver", "gold", "platinum"].includes(lower)
    ? lower
    : null;
}

function getStatusMeta(status: BenefitStatus) {
  switch (status) {
    case "REDEEMED":
      return { symbol: "✅", label: "Redeemed" };
    case "HAS_ACCESS":
      return { symbol: "🟡", label: "Available" };
    case "NO_ACCESS":
    default:
      return { symbol: "🔒", label: "Not included in your tier" };
  }
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

  const session = await getServerAuthSession();

  if (session?.user?.id) {
    const userId = (session.user as any).id;

    const memberData = await getMemberDashboardData(userId);
    if (memberData) {
      const tierKey = normaliseTierKey(memberData.membershipTierKey);
      const myRank =
        memberData.membershipTierRank ??
        (tierKey ? MEMBERSHIP_TIER_RANK[tierKey] : null);

      const neededRank = MEMBERSHIP_TIER_RANK[benefit.tierMin];

      if (myRank !== null && myRank >= neededRank) hasAccess = true;
      isRedeemed = memberData.redeemedBenefitCodes.includes(id);
    }
  }

  const status = determineStatus(hasAccess, isRedeemed);
  const { symbol, label } = getStatusMeta(status);

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{benefit.label}</h1>
        <p>{benefit.description}</p>
      </header>

      {/* Status */}
      <section style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
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
              <Link href="/membership-dashboard/" className="button-link">
                Back to benefits list
              </Link>
            </p>
          </>
        )}

        {status === "NO_ACCESS" && (
          <>
            <p>
              This benefit is not included in your membership tier. You may
              discuss upgrade options during your next client experience
              check-in — for example via the{" "}
              <strong>“Schedule your next client experience check-in”</strong>{" "}
              button in the membership dashboard.
            </p>

            <p style={{ marginTop: "1.25rem" }}>
              <Link href="/membership-dashboard/" className="button-link">
                Back to benefits list
              </Link>
            </p>
          </>
        )}

        {status === "HAS_ACCESS" && (
          <p>
            You have access to this benefit and have not yet redeemed it. Coordinate next steps with your client experience manager.
          </p>
        )}
      </section>

      {/* HAS ACCESS ONLY: process + terms */}
      {status === "HAS_ACCESS" && (
        <>
          {/* Process */}
          {benefit.process && (
            <section style={{ marginTop: "1.5rem" }}>
              <h2>How this benefit works</h2>
<p>To
            redeem this benefit, follow the process outlined below.</p>
              {/* Trigger */}
              {benefit.process.trigger && (
                <section style={{ marginTop: "1rem" }}>
                  <h3>Trigger</h3>
                  <p>{benefit.process.trigger}</p>
                  <button
                    type="button"
                    className="button-link"
                    disabled
                    aria-disabled="true"
                    style={{ marginTop: "0.5rem" }}
                  >
                    Redeem benefit now
                  </button>
                </section>
              )}

              {/* Actions */}
              {benefit.process.actions && benefit.process.actions.length > 0 && (
                <section style={{ marginTop: "1.25rem" }}>
                  <h3>Actions</h3>
                  <ul>
                    {benefit.process.actions.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Outcome */}
              {benefit.process.outcome && (
                <section style={{ marginTop: "1.25rem" }}>
                  <h3>Outcome</h3>
                  <p>{benefit.process.outcome}</p>
                  <button
                    type="button"
                    className="button-link"
                    disabled
                    aria-disabled="true"
                    style={{ marginTop: "0.5rem" }}
                  >
                    Launch partner satisfaction survey
                  </button>
                </section>
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
            <Link href="/membership-dashboard/" className="button-link">
              Back to benefits list
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
