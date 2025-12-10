// src/components/membership-dashboard/MemberDashboard.tsx
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  BENEFITS,
  MEMBERSHIP_TIER_RANK,
  MembershipTierKey,
} from "@/content/benefits";

type MemberDashboardProps = {
  firstName: string;
  organisationName: string | null;

  membershipTierLabel: string;
  membershipTierKey: string | null;
  membershipTierRank: number | null;
  membershipExpiry: Date | null;
  membershipManagerName: string | null;

  redeemedBenefitCodes: string[];
};

function normaliseTierKey(key: string | null): MembershipTierKey | null {
  if (!key) return null;
  const lower = key.toLowerCase() as MembershipTierKey;
  return ["bronze", "silver", "gold", "platinum"].includes(lower)
    ? lower
    : null;
}

export default function MemberDashboard({
  firstName,
  organisationName,
  membershipTierLabel,
  membershipTierKey,
  membershipTierRank,
  membershipExpiry,
  membershipManagerName,
  redeemedBenefitCodes,
}: MemberDashboardProps) {
  const normTierKey = normaliseTierKey(membershipTierKey);
  const myRank =
    membershipTierRank ??
    (normTierKey ? MEMBERSHIP_TIER_RANK[normTierKey] : null);

  const redeemed = new Set(redeemedBenefitCodes);

  // Superseded benefits
  const superseded = new Set<string>();
  if (myRank !== null) {
    BENEFITS.forEach((b) => {
      if (!b.supersedes || !b.supersedes.length) return;
      const needed = MEMBERSHIP_TIER_RANK[b.tierMin];
      if (myRank >= needed) {
        b.supersedes.forEach((id) => superseded.add(id));
      }
    });
  }

  const benefitsEffective = BENEFITS.filter((b) => !superseded.has(b.id));

  const formattedExpiry =
    membershipExpiry != null
      ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
          membershipExpiry,
        )
      : "Not set";

  // Default always to Marco Piccionello when not provided
  const manager =
    membershipManagerName && membershipManagerName.trim().length
      ? membershipManagerName
      : "Marco Piccionello";

  return (
    <section
      className="content-section stack"
      style={{ "--stack-gap": "1.25rem" } as CSSProperties}
    >
      <header className="content-header">
        <h1>Membership Dashboard</h1>
      </header>

      <p>
        Hello <strong>{firstName}</strong>, welcome back to your UCL Computer
        Science Alliances dashboard.
      </p>

      {/* Secondary navigation – renamed items, still placeholders for now */}
      <nav aria-label="Secondary" className="cluster">
        <button
          type="button"
          className="pill"
          aria-disabled="true"
          disabled
          title="This action will be enabled in a future release."
        >
          Schedule your next client experience check-in
        </button>
        <button
          type="button"
          className="pill"
          aria-disabled="true"
          disabled
          title="This action will be enabled in a future release."
        >
          Send a custom engagement request
        </button>
      </nav>

      {/* Membership summary */}
      <section className="tile" style={{ padding: "0.75rem 1rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Membership</h2>
        <dl className="membership-meta">
          <div>
            <dt>Organisation</dt>
            <dd>{organisationName ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{membershipTierLabel}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{formattedExpiry}</dd>
          </div>
          <div>
            <dt>Account manager</dt>
            <dd>{manager}</dd>
          </div>
        </dl>
      </section>

      {/* Benefits list */}
      <section
        className="stack"
        style={{ "--stack-gap": ".5rem" } as CSSProperties}
      >
        <h2>Benefits</h2>
        <p className="small">
          Legend: ✅ redeemed · 🟡 available · 🔒 not included in your tier
        </p>

        <ul
          className="list-plain stack"
          style={{ "--stack-gap": ".5rem" } as CSSProperties}
        >
          {benefitsEffective.map((b) => {
            const neededRank = MEMBERSHIP_TIER_RANK[b.tierMin];

            let symbol = "🔒";
            if (myRank !== null && myRank >= neededRank) {
              symbol = redeemed.has(b.id) ? "✅" : "🟡";
            }

            return (
              <li key={b.id}>
                <div className="tile" style={{ padding: ".5rem .75rem" }}>
                  <div className="benefit">
                    <span className="benefit-state">{symbol}</span>
                    <Link
                      href={`/membership-dashboard/benefits/${b.id}`}
                      className="benefit-link"
                    >
                      <strong>{b.label}</strong>
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
