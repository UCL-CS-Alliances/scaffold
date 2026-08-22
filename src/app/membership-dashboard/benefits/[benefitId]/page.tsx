import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getSupersedingBenefit,
  hasBenefitAccess,
  resolveMemberRank,
} from "@/lib/benefit-access";
import {
  getBenefitActionProgressForOrganisation,
  getBenefitCatalogue,
  getBenefitPartnerNotesForOrganisation,
  type BenefitActionProgressMap,
  type CatalogueBenefit,
  type OrganisationBenefitRequest,
} from "@/lib/benefits";
import prisma from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import { getMemberDashboardData } from "@/lib/membership-dashboard";
import SecondaryNav from "@/components/membership-dashboard/SecondaryNav";
import BenefitRequestDialog from "@/components/membership-dashboard/BenefitRequestDialog";

type PageProps = {
  params: Promise<{ benefitId: string }>;
};

type BenefitStatus =
  | "REDEEMED"
  | "REQUESTED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "SUPERSEDED"
  | "HAS_ACCESS"
  | "NO_ACCESS";

// Precedence matters, and the order is deliberate: tier access first, then
// redeemed — a redeemed benefit stays "Redeemed" whatever else is true — then
// any open request, then superseded. The open request sits AHEAD of
// superseded because it is a live fact about this benefit (someone at the
// organisation has actually asked for it), whereas supersede is advice about
// a better one — advice must not hide a request already in flight.
function determineStatus(
  hasAccess: boolean,
  isRedeemed: boolean,
  openRequest: OrganisationBenefitRequest | null,
  isSuperseded: boolean,
): BenefitStatus {
  if (!hasAccess) return "NO_ACCESS";
  if (isRedeemed) return "REDEEMED";
  if (openRequest) {
    switch (openRequest.status) {
      case "REQUESTED":
        return "REQUESTED";
      case "ACKNOWLEDGED":
        return "ACKNOWLEDGED";
      case "IN_PROGRESS":
        return "IN_PROGRESS";
      // CLOSED never reaches here — the resolver returns open requests only —
      // but fall through to the ordinary statuses rather than lie if it does.
    }
  }
  if (isSuperseded) return "SUPERSEDED";
  return "HAS_ACCESS";
}

function getStatusMeta(status: BenefitStatus) {
  switch (status) {
    case "REDEEMED":
      return { symbol: "✅", label: "Redeemed" };
    case "REQUESTED":
      return { symbol: "⏳", label: "Requested" };
    case "ACKNOWLEDGED":
      return { symbol: "📬", label: "Acknowledged" };
    case "IN_PROGRESS":
      return { symbol: "🔧", label: "Working on it" };
    case "SUPERSEDED":
      return { symbol: "⬆️", label: "Replaced by an upgraded benefit" };
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

  const benefits = await getBenefitCatalogue(prisma);

  // A retired benefit is not in the catalogue, so its page 404s rather than
  // presenting a benefit that has been withdrawn.
  const benefit = benefits.find((b) => b.id === id);
  if (!benefit) notFound();

  // Default assumptions: not logged in / no membership data
  let hasAccess = false;
  let isRedeemed = false;
  // The benefit that replaces this one for this member, if any. The member
  // dashboard hides superseded benefits from its list, so without this the page
  // is only reachable by direct URL — and used to present a replaced benefit as
  // available, with a process to follow that no longer applies.
  let supersededBy: CatalogueBenefit | null = null;
  // The SAT-written note for this member's organisation on this benefit, if
  // one exists. Partner-confidential, so the organisation comes from the
  // session's user record — never from a query parameter.
  let partnerNote: string | null = null;
  // The organisation's admin-recorded progress through this benefit's steps,
  // keyed by step id. Read-only here — members see it, never change it.
  let progress: BenefitActionProgressMap = {};
  // The organisation's open request for this benefit, if one exists — a
  // colleague's request is the same request, so every contact sees it.
  let openRequest: OrganisationBenefitRequest | null = null;

  const session = await getServerAuthSession();

  if (session?.user?.id) {
    const userId = session.user.id;

    const memberData = await getMemberDashboardData(userId);
    if (memberData) {
      const myRank = resolveMemberRank(
        memberData.membershipTierRank,
        memberData.membershipTierKey,
      );

      hasAccess = hasBenefitAccess(myRank, benefit.tierMinRank);
      isRedeemed = memberData.redeemedBenefitCodes.includes(id);
      supersededBy = getSupersedingBenefit(myRank, benefits, benefit.id);
      openRequest = memberData.openBenefitRequests[id] ?? null;

      if (memberData.organisationId != null) {
        const notes = await getBenefitPartnerNotesForOrganisation(
          prisma,
          memberData.organisationId,
        );
        partnerNote = notes[id] ?? null;

        progress = await getBenefitActionProgressForOrganisation(
          prisma,
          memberData.organisationId,
        );
      }
    }
  }

  const status = determineStatus(
    hasAccess,
    isRedeemed,
    openRequest,
    supersededBy != null,
  );
  const { symbol, label } = getStatusMeta(status);

  // Process, terms and the back link stay on the page throughout the request
  // ladder: has access, not redeemed, not superseded. Gating them on
  // HAS_ACCESS alone would make them vanish the moment a member requests.
  const showProcessAndTerms =
    status === "HAS_ACCESS" ||
    status === "REQUESTED" ||
    status === "ACKNOWLEDGED" ||
    status === "IN_PROGRESS";

  const backHref = "/membership-dashboard/";

  const process = benefit.process;
  const hasProcess = Boolean(
    process.trigger || process.outcome || process.actions.length > 0,
  );

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

        {status === "REQUESTED" && openRequest && (
          <>
            <p>
              {openRequest.requestedByName ?? "A colleague"} requested this
              benefit for your organisation on{" "}
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
              }).format(openRequest.requestedAt)}
              . Your client experience manager will be in touch to arrange the
              next steps — there is nothing more you need to do. To change or
              withdraw the request, speak to your manager directly.
            </p>

            {/* Echo what was submitted, so the member can see what their
                organisation asked for without having to remember it. */}
            <div
              className="tile"
              style={{ marginTop: "0.75rem", padding: "0.75rem 1rem" }}
            >
              <p className="small" style={{ margin: 0 }}>
                <strong>The request</strong>
              </p>
              <p style={{ whiteSpace: "pre-wrap", margin: "0.25rem 0 0" }}>
                {openRequest.note}
              </p>
              {openRequest.preferredTimeframe && (
                <p className="small" style={{ margin: "0.5rem 0 0" }}>
                  Preferred timeframe: {openRequest.preferredTimeframe}
                </p>
              )}
              {openRequest.contactPreference && (
                <p className="small" style={{ margin: "0.25rem 0 0" }}>
                  Best contact: {openRequest.contactPreference}
                </p>
              )}
            </div>
          </>
        )}

        {status === "ACKNOWLEDGED" && (
          <p>
            Your client experience manager has acknowledged your
            organisation&apos;s request for this benefit. The next steps are
            the benefit&apos;s process actions below — your organisation&apos;s
            progress through them is shown as the team records it.
          </p>
        )}

        {status === "IN_PROGRESS" && (
          <p>
            Your client experience manager is working on your
            organisation&apos;s request for this benefit. Progress through the
            process steps below is recorded as it happens.
          </p>
        )}
      </section>

      {/* Partner note: written by the SAT about this organisation, rendered on
          every status — a note explaining why a benefit is unavailable or
          replaced is exactly the useful case. Plain text, whitespace kept. */}
      {partnerNote && (
        <section
          className="tile"
          style={{ marginTop: "1.5rem", padding: "1rem" }}
        >
          <h2>Note from the Strategic Alliances Team</h2>
          <p style={{ whiteSpace: "pre-wrap", marginTop: ".5rem" }}>
            {partnerNote}
          </p>
        </section>
      )}

      {/* Available or requested (see showProcessAndTerms): process + terms */}
      {showProcessAndTerms && (
        <>
          {/* Request: its own block, deliberately NOT inside the trigger
              section below — Benefit.trigger is nullable and admin-editable,
              so parking the button there would let an admin clearing the
              trigger text silently remove the only way to request. */}
          {status === "HAS_ACCESS" && (
            <section style={{ marginTop: "1.5rem" }}>
              <h2>Request this benefit</h2>
              <p>
                Ready to use this benefit? Send your client experience manager
                a request and they will arrange it with you.
              </p>
              <BenefitRequestDialog
                benefitCode={benefit.id}
                benefitLabel={benefit.label}
              />
            </section>
          )}

          {/* Process */}
          {hasProcess && (
            <section className="benefit-process" style={{ marginTop: "1.5rem" }}>
              <h2>How this benefit works</h2>
              <p>To redeem this benefit, follow the process outlined below.</p>

              {process.trigger && (
                <section style={{ marginTop: "1rem" }}>
                  <h3>Trigger</h3>
                  <p>{process.trigger}</p>
                </section>
              )}

              {process.actions.length > 0 &&
                (() => {
                  // Admin-recorded progress, shown read-only. State is
                  // announced in visible text ("Completed …"), never by
                  // colour or a glyph alone; the tick mark is decorative.
                  const completedCount = process.actions.filter(
                    (step) => progress[step.id],
                  ).length;
                  const hasProgress = completedCount > 0;

                  return (
                    <section style={{ marginTop: "1.25rem" }}>
                      <h3>Actions</h3>

                      {hasProgress && (
                        <p className="small">
                          Your organisation has completed {completedCount} of{" "}
                          {process.actions.length} steps, recorded by the
                          Strategic Alliances Team.
                        </p>
                      )}

                      <ul>
                        {process.actions.map((step) => {
                          const completedAt =
                            progress[step.id]?.completedAt ?? null;
                          const done = Boolean(progress[step.id]);

                          return (
                            <li key={step.id}>
                              {step.body}
                              {done && (
                                <span className="small">
                                  {" "}
                                  <span aria-hidden="true">✓</span> Completed
                                  {completedAt &&
                                    ` ${new Intl.DateTimeFormat("en-GB", {
                                      dateStyle: "medium",
                                    }).format(completedAt)}`}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })()}

              {process.outcome && (
                <section style={{ marginTop: "1.25rem" }}>
                  <h3>Outcome</h3>
                  <p>{process.outcome}</p>
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
