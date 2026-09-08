// src/components/membership-dashboard/MemberDashboard.tsx
"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type {
  CatalogueBenefit,
  OrganisationBenefitRequest,
} from "@/lib/benefits";
import {
  getEffectiveBenefits,
  hasBenefitAccess,
  resolveMemberRank,
} from "@/lib/benefit-access";
import SecondaryNav from "@/components/membership-dashboard/SecondaryNav";
import BenefitsFilterToolbar from "@/components/membership-dashboard/BenefitsFilterToolbar";
import { getSatTeamManager } from "@/content/contactRouting";

type MemberDashboardProps = {
  firstName: string;
  organisationName: string | null;

  membershipTierLabel: string;
  membershipTierKey: string | null;
  membershipTierRank: number | null;
  membershipExpiry: Date | null;
  membershipManagerName: string | null;

  redeemedBenefitCodes: string[];

  // The organisation's open benefit requests, keyed by benefit code — a
  // colleague's request shows here too.
  openBenefitRequests: Record<string, OrganisationBenefitRequest>;

  // Resolved by the server component: this is a client component and cannot
  // read the catalogue itself.
  benefits: CatalogueBenefit[];
};

type BenefitFilter = "redeemed" | "requested" | "available" | "locked" | null;

export default function MemberDashboard(props: MemberDashboardProps) {
  const {
    firstName,
    organisationName,
    membershipTierLabel,
    membershipTierKey,
    membershipTierRank,
    membershipExpiry,
    membershipManagerName,
    redeemedBenefitCodes,
    openBenefitRequests,
    benefits,
  } = props;

  const [filter, setFilter] = useState<BenefitFilter>(null);

  const myRank = resolveMemberRank(membershipTierRank, membershipTierKey);

  const redeemed = useMemo(() => new Set(redeemedBenefitCodes), [redeemedBenefitCodes]);

  // Benefits superseded by a better one the member already has are hidden
  const benefitsEffective = useMemo(
    () => getEffectiveBenefits(myRank, benefits),
    [myRank, benefits],
  );

  const formattedExpiry =
    membershipExpiry != null
      ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
          membershipExpiry,
        )
      : "Not set";

  // No assigned manager: the Strategic Alliances Team fronts the relationship,
  // matching the check-in link and contact form fallbacks.
  const manager =
    membershipManagerName && membershipManagerName.trim().length
      ? membershipManagerName
      : getSatTeamManager().name;

  // Build benefit rows with computed state. Precedence: redeemed → locked →
  // requested → available. Redeemed comes FIRST (2026-08-22): a delivered
  // benefit reads ✅ even when the current tier no longer includes it — the
  // old locked-first order hid such redemptions behind 🔒. The three open
  // request statuses share the single "requested" filter state (so one
  // toolbar toggle covers them all) but carry their own glyph and label,
  // matching the detail page.
  const benefitRows = useMemo(() => {
    return benefitsEffective.map((b) => {
      let state: Exclude<BenefitFilter, null> = "locked";
      let symbol = "🔒";
      let stateLabel = "Not included in your tier";

      if (redeemed.has(b.id)) {
        state = "redeemed";
        symbol = "✅";
        stateLabel = "Redeemed";
      } else if (hasBenefitAccess(myRank, b.tierMinRank)) {
        const request = openBenefitRequests[b.id];
        if (request?.status === "ACKNOWLEDGED") {
          state = "requested";
          symbol = "📬";
          stateLabel = "Acknowledged";
        } else if (request?.status === "IN_PROGRESS") {
          state = "requested";
          symbol = "🔧";
          stateLabel = "Working on it";
        } else if (request) {
          state = "requested";
          symbol = "⏳";
          stateLabel = "Requested";
        } else {
          state = "available";
          symbol = "🟡";
          stateLabel = "Available";
        }
      }

      return { benefit: b, state, symbol, stateLabel };
    });
  }, [benefitsEffective, myRank, redeemed, openBenefitRequests]);

  const counts = useMemo(() => {
    const c = { redeemed: 0, requested: 0, available: 0, locked: 0 };
    benefitRows.forEach((r) => {
      c[r.state] += 1;
    });
    return c;
  }, [benefitRows]);

  const visibleRows = useMemo(() => {
    if (!filter) return benefitRows;
    return benefitRows.filter((r) => r.state === filter);
  }, [benefitRows, filter]);

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

      {/* Secondary navigation */}
      <SecondaryNav />

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
            <dt>End of annual membership</dt>
            <dd>{formattedExpiry}</dd>
          </div>
          <div>
            <dt>Client experience manager</dt>
            <dd>{manager}</dd>
          </div>
        </dl>
      </section>

      {/* Benefits list */}
      <section
        className="stack"
        style={{ "--stack-gap": ".75rem" } as CSSProperties}
      >
        <h2>Benefits</h2>

        {/* Filter toolbar (right-aligned) */}
        <BenefitsFilterToolbar value={filter} onChange={setFilter} counts={counts} />

        <ul
          className="list-plain stack"
          style={{ "--stack-gap": ".5rem" } as CSSProperties}
        >
          {visibleRows.map(({ benefit: b, symbol, stateLabel }) => (
            <li key={b.id}>
              <div className="tile" style={{ padding: ".5rem .75rem" }}>
                <div className="benefit">
                  {/* The glyph is decorative; the state is announced by the
                      sr-only text so it never rides on the emoji alone. */}
                  <span className="benefit-state" aria-hidden="true">
                    {symbol}
                  </span>
                  <span className="sr-only">{stateLabel}</span>
                  <Link
                    href={`/membership-dashboard/benefits/${b.id}`}
                    className="benefit-link"
                  >
                    <strong>{b.label}</strong>
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
