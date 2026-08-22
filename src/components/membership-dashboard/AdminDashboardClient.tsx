// src/components/membership-dashboard/AdminDashboardClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BenefitActionProgressMap,
  CatalogueBenefit,
  EditorBenefit,
  OrganisationBenefitRequest,
} from "@/lib/benefits";
import type {
  AdminBenefitAuditEntry,
  AdminBenefitRedemptionStat,
  AdminMemberListItem,
  AdminSelectedMember,
  MembershipTierOption,
} from "@/lib/membership-dashboard-admin";
import type { HandbookRenderResult } from "@/lib/handbook";
import BenefitCatalogueEditor from "./BenefitCatalogueEditor";
import BenefitPartnerNotes from "./BenefitPartnerNotes";
import BenefitRedemptionChecklist from "./BenefitRedemptionChecklist";

type TabKey = "members" | "benefits" | "handbook";

function asTabKey(v: string | null | undefined): TabKey | null {
  if (v === "members" || v === "benefits" || v === "handbook") return v;
  return null;
}

// The benefits tab's no-selection view: redemption stats by default, with the
// catalogue editor as a deliberate ?view= destination (same guard style as
// asTabKey; talent-discovery's ?view= is the precedent).
type BenefitsViewKey = "stats" | "editor";

function asBenefitsViewKey(v: string | null | undefined): BenefitsViewKey | null {
  if (v === "stats" || v === "editor") return v;
  return null;
}

function formatDateGB(d: Date | string | null | undefined) {
  if (!d) return "Not set";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function formatDateTimeGB(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Codes come from the audit trail, which records what was redeemed at the time.
// A code whose benefit has since been retired will not be in the catalogue, so
// the raw code is shown rather than nothing.
function benefitLabel(benefits: CatalogueBenefit[], code: string) {
  return benefits.find((b) => b.id === code)?.label ?? code;
}

// Only the open statuses ever reach this map — the resolver excludes CLOSED —
// and only REQUESTED is written today; the other two are sub-issue F's.
function requestStatusLabel(status: OrganisationBenefitRequest["status"]) {
  switch (status) {
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "IN_PROGRESS":
      return "Working on it";
    default:
      return "Requested";
  }
}

// Actor display for an audit entry; actorId is nulled when the admin account
// is deleted, so fall back to the email denormalised into the record.
function auditActorLabel(entry: AdminBenefitAuditEntry) {
  if (entry.actorDeleted) {
    return `${entry.actorEmail ?? "Unknown actor"} (deleted account)`;
  }
  return entry.actorName
    ? `${entry.actorName}${entry.actorEmail ? ` (${entry.actorEmail})` : ""}`
    : entry.actorEmail ?? "Unknown actor";
}

function tierIcon(tierMin: string) {
  const k = tierMin.toLowerCase();
  if (k.includes("platinum")) return { glyph: "🏆", label: "Platinum tier" };
  if (k.includes("gold")) return { glyph: "🥇", label: "Gold tier" };
  if (k.includes("silver")) return { glyph: "🥈", label: "Silver tier" };
  return { glyph: "🥉", label: "Bronze tier" };
}

export default function AdminDashboardClient(props: {
  members: AdminMemberListItem[];
  selectedUserId: string | null;
  selectedMember: AdminSelectedMember | null;
  benefits: CatalogueBenefit[];
  editorBenefits: EditorBenefit[];
  tierOptions: MembershipTierOption[];
  benefitStats: AdminBenefitRedemptionStat[];
  benefitAuditTrail: AdminBenefitAuditEntry[];
  partnerNotes: Record<string, string>;
  partnerProgress: BenefitActionProgressMap;
  partnerOpenRequests: Record<string, OrganisationBenefitRequest>;
  stepProgressCounts: Record<number, number>;
  initialTab?: string | null;
  handbook: HandbookRenderResult;
}) {
  const {
    members,
    selectedUserId,
    selectedMember,
    benefits,
    editorBenefits,
    tierOptions,
    benefitStats,
    benefitAuditTrail,
    partnerNotes,
    partnerProgress,
    partnerOpenRequests,
    stepProgressCounts,
    initialTab,
    handbook,
  } = props;

  const router = useRouter();
  const sp = useSearchParams();
  // Only the trigger is needed now: per-benefit saves own their pending state
  // inside BenefitRedemptionChecklist.
  const [, startTransition] = useTransition();

  const tocSlug = handbook.chapters[0]?.slug ?? "table-of-contents";

  // Local select state fixes "snap back" during RSC refresh
  const [localSelectedUserId, setLocalSelectedUserId] = useState(
    selectedUserId ?? "",
  );

  useEffect(() => {
    setLocalSelectedUserId(selectedUserId ?? "");
  }, [selectedUserId]);

  // URL controls initial state; default is "members"
  const urlTab = asTabKey(sp?.get("tab"));
  const bootTab = asTabKey(initialTab) ?? urlTab ?? "members";
  const [activeTab, setActiveTab] = useState<TabKey>(bootTab);

  useEffect(() => {
    const next = asTabKey(sp?.get("tab"));
    if (next && next !== activeTab) setActiveTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // Stats are the default; the editor is opted into via ?view=editor so an
  // admin never lands on live-editing forms by accident.
  const [benefitsView, setBenefitsView] = useState<BenefitsViewKey>(
    asBenefitsViewKey(sp?.get("view")) ?? "stats",
  );

  // Sync from the URL only when the URL itself changes (same as the tab effect
  // above): with benefitsView in the deps this re-ran against the stale URL the
  // moment changeBenefitsView set state, snapping the view straight back.
  useEffect(() => {
    const next = asBenefitsViewKey(sp?.get("view")) ?? "stats";
    if (next !== benefitsView) setBenefitsView(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function changeBenefitsView(next: BenefitsViewKey) {
    setBenefitsView(next);
    const params = new URLSearchParams(sp?.toString());
    if (next === "stats") params.delete("view");
    else params.set("view", next);

    startTransition(() => {
      pushWithParams(params);
    });
  }

  const hasSelection = Boolean(selectedUserId && selectedMember);

  // No router.refresh() alongside this: the page is force-dynamic, so the
  // replace already fetches a fresh server render. A refresh would run a second
  // full render concurrently — on the pooled connection_limit=1 database every
  // query serialises, and the doubled queue is enough to hit Prisma's pool
  // timeout, which is what made selecting a partner hang or fail to load.
  function pushWithParams(nextParams: URLSearchParams) {
    router.replace(`/membership-dashboard?${nextParams.toString()}`);
  }

  function setSelectedUser(nextUserId: string) {
    const params = new URLSearchParams(sp?.toString());
    if (!nextUserId) params.delete("userId");
    else params.set("userId", nextUserId);

    startTransition(() => {
      pushWithParams(params);
    });
  }

  function changeTab(next: TabKey) {
    setActiveTab(next);
    const params = new URLSearchParams(sp?.toString());
    params.set("tab", next);

    // If entering handbook and no chapter is set, default to the ToC chapter.
    if (next === "handbook" && !params.get("chapter")) {
      params.set("chapter", tocSlug);
    }

    startTransition(() => {
      pushWithParams(params);
    });
  }

  // Both groupings key on organisationId and never on the name:
  // Organisation.name has no unique constraint and the admin "Add organisation"
  // modal can create duplicates, so grouping by name would silently merge two
  // distinct legal entities into one row.
  //
  // Ordering is applied explicitly here rather than inherited from
  // getAdminMemberList's orderBy via Map insertion order, so a later change to
  // that query cannot silently reorder the UI.
  const selectorGroups = useMemo(() => {
    const byOrg = new Map<
      number,
      { organisationId: number; organisationName: string; items: AdminMemberListItem[] }
    >();

    for (const m of members) {
      const group = byOrg.get(m.organisationId);
      if (group) group.items.push(m);
      else
        byOrg.set(m.organisationId, {
          organisationId: m.organisationId,
          organisationName: m.organisationName,
          items: [m],
        });
    }

    return [...byOrg.values()]
      .sort((a, b) => a.organisationName.localeCompare(b.organisationName))
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => a.contactName.localeCompare(b.contactName)),
      }));
  }, [members]);

  const tierGroups = useMemo(() => {
    const byTier = new Map<
      string,
      {
        tierLabel: string;
        tierRank: number;
        orgs: Map<
          number,
          { organisationId: number; organisationName: string; items: AdminMemberListItem[] }
        >;
      }
    >();

    for (const m of members) {
      let tier = byTier.get(m.tierKey);
      if (!tier) {
        tier = { tierLabel: m.tierLabel, tierRank: m.tierRank, orgs: new Map() };
        byTier.set(m.tierKey, tier);
      }

      const org = tier.orgs.get(m.organisationId);
      if (org) org.items.push(m);
      else
        tier.orgs.set(m.organisationId, {
          organisationId: m.organisationId,
          organisationName: m.organisationName,
          items: [m],
        });
    }

    return [...byTier.values()]
      .sort((a, b) => b.tierRank - a.tierRank) // Platinum -> Bronze
      .map((tier) => ({
        tierLabel: tier.tierLabel,
        organisationCount: tier.orgs.size,
        orgs: [...tier.orgs.values()]
          .sort((a, b) => a.organisationName.localeCompare(b.organisationName))
          .map((org) => ({
            ...org,
            items: [...org.items].sort((a, b) => a.contactName.localeCompare(b.contactName)),
          })),
      }));
  }, [members]);

  const benefitStatsMap = useMemo(() => {
    const m = new Map<string, AdminBenefitRedemptionStat>();
    benefitStats.forEach((s) => m.set(s.benefitId, s));
    return m;
  }, [benefitStats]);

  function handbookHref(chapterSlug: string) {
    const params = new URLSearchParams(sp?.toString());
    params.set("tab", "handbook");
    params.set("chapter", chapterSlug);
    return `/membership-dashboard?${params.toString()}`;
  }

  const isTocPage = handbook.active.slug === tocSlug;

  return (
    <>
      {/* Account selector */}
      <section className="admin-section">
        <h2 style={{ marginTop: 0 }}>Select an account</h2>

        <div className="admin-selector-row">
          <p style={{ margin: 0, maxWidth: "60ch" }}>
            Select an organisation to view member details and benefit redemption
            status. If no account is selected, you will see summary views.
          </p>

          <label className="sr-only" htmlFor="adminAccountSelector">
            Select account
          </label>
          <select
            id="adminAccountSelector"
            className="auth-input"
            value={localSelectedUserId}
            onChange={(e) => {
              const next = e.target.value;
              setLocalSelectedUserId(next);
              setSelectedUser(next);
            }}
            style={{ width: "min(28rem, 100%)" }}
          >
            <option value="">No account selected (summary view)</option>
            {selectorGroups.map((group) => (
              <optgroup key={group.organisationId} label={group.organisationName}>
                {group.items.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.contactName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      {/* Tabs + panels */}
      <section className="admin-section">
        <div className="tabs">
          <div className="tab-list" role="tablist">
            <button
              type="button"
              role="tab"
              className={`tab ${activeTab === "members" ? "is-active" : ""}`}
              aria-selected={activeTab === "members"}
              aria-controls="panel-members"
              id="tab-members"
              onClick={() => changeTab("members")}
            >
              Members
            </button>

            <button
              type="button"
              role="tab"
              className={`tab ${activeTab === "benefits" ? "is-active" : ""}`}
              aria-selected={activeTab === "benefits"}
              aria-controls="panel-benefits"
              id="tab-benefits"
              onClick={() => changeTab("benefits")}
            >
              Benefits
            </button>

            <button
              type="button"
              role="tab"
              className={`tab ${activeTab === "handbook" ? "is-active" : ""}`}
              aria-selected={activeTab === "handbook"}
              aria-controls="panel-handbook"
              id="tab-handbook"
              onClick={() => changeTab("handbook")}
            >
              Handbook
            </button>
          </div>

          {/* Members panel */}
          <div
            role="tabpanel"
            id="panel-members"
            aria-labelledby="tab-members"
            className="tab-panel tab-panel--scroll"
            hidden={activeTab !== "members"}
          >
            {!hasSelection ? (
              <>
                <h3 style={{ marginTop: 0 }}>Members overview</h3>

                {tierGroups.map((tier) => (
                  <details key={tier.tierLabel} open>
                    <summary>
                      <strong>{tier.tierLabel}</strong> ({tier.organisationCount})
                    </summary>

                    <ul className="list-plain" style={{ marginTop: ".5rem" }}>
                      {tier.orgs.map((org) => (
                        <li key={org.organisationId} style={{ marginBottom: ".5rem" }}>
                          <strong>{org.organisationName}</strong>

                          <ul
                            className="list-plain"
                            style={{ marginTop: ".25rem", marginLeft: "1rem" }}
                          >
                            {org.items.map((m) => (
                              <li key={m.userId} style={{ marginBottom: ".35rem" }}>
                                {m.contactName}
                                {m.jobTitle?.trim() ? `, ${m.jobTitle}` : ""}
                                {m.isPrimaryContact && (
                                  <span className="pill" style={{ marginLeft: ".4rem" }}>
                                    Primary contact
                                  </span>
                                )}{" "}
                                — Last sign-in: <span>{m.lastSignedInLabel}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>Member details</h3>

                <ul>
                  <li>
                    <strong>Organisation:</strong>{" "}
                    {selectedMember?.organisationName ?? "Unknown"}
                  </li>
                  <li>
                    <strong>Contact:</strong>{" "}
                    {selectedMember?.contactName ?? "Unknown"}
                    {selectedMember?.isPrimaryContact ? " (primary contact)" : ""}
                  </li>
                  <li>
                    <strong>Job title:</strong>{" "}
                    {selectedMember?.jobTitle?.trim() ? selectedMember.jobTitle : "Not set"}
                  </li>
                  <li>
                    <strong>Membership tier:</strong>{" "}
                    {selectedMember?.membershipTierLabel ?? "Unknown"}
                  </li>
                  <li>
                    <strong>Expiry date:</strong>{" "}
                    {formatDateGB(selectedMember?.membershipExpiry)}
                  </li>
                  <li>
                    <strong>Client experience manager:</strong>{" "}
                    {selectedMember?.membershipManagerName?.trim()
                      ? selectedMember.membershipManagerName
                      : "Not set"}
                  </li>
                  <li>
                    <strong>Status:</strong>{" "}
                    {selectedMember?.membershipStatus ?? "Not set"}
                  </li>
                  <li>
                    <strong>User role(s):</strong>{" "}
                    {selectedMember?.roleKeys?.length
                      ? selectedMember.roleKeys.join(", ")
                      : "None"}
                  </li>
                  <li>
                    <strong>Default app:</strong>{" "}
                    {selectedMember?.defaultAppName
                      ? `${selectedMember.defaultAppName} (${selectedMember.defaultAppKey})`
                      : "Not set"}
                  </li>
                </ul>

                <div style={{ marginTop: "1rem" }}>
                  <Link
                    className="button-link button-link--secondary"
                    href={`/account?userId=${encodeURIComponent(selectedUserId ?? "")}`}
                  >
                    Edit profile
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Benefits panel */}
          <div
            role="tabpanel"
            id="panel-benefits"
            aria-labelledby="tab-benefits"
            className="tab-panel tab-panel--scroll"
            hidden={activeTab !== "benefits"}
          >
            {!hasSelection ? (
              <>
                <h3 style={{ marginTop: 0 }}>
                  {benefitsView === "editor"
                    ? "Benefit catalogue editor"
                    : "Benefits overview"}
                </h3>

                <div className="cluster" style={{ marginBottom: ".75rem" }}>
                  <button
                    type="button"
                    className={`tab ${benefitsView === "stats" ? "is-active" : ""}`}
                    aria-pressed={benefitsView === "stats"}
                    onClick={() => changeBenefitsView("stats")}
                  >
                    Redemption stats
                  </button>
                  <button
                    type="button"
                    className={`tab ${benefitsView === "editor" ? "is-active" : ""}`}
                    aria-pressed={benefitsView === "editor"}
                    onClick={() => changeBenefitsView("editor")}
                  >
                    Edit catalogue
                  </button>
                </div>

                {benefitsView === "editor" ? (
                  <BenefitCatalogueEditor
                    benefits={editorBenefits}
                    tierOptions={tierOptions}
                    stepProgressCounts={stepProgressCounts}
                  />
                ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Benefit</th>
                        <th>Eligible members</th>
                        <th>Redeemed</th>
                        <th>% Redeemed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benefits.map((b) => {
                        const stat = benefitStatsMap.get(b.id);
                        const pct =
                          stat?.percent == null ? "—" : `${stat.percent}%`;

                        const icon = tierIcon(b.tierMin);

                        return (
                          <tr key={b.id}>
                            <td>
                              <strong>{b.label}</strong>{" "}
                              <span>
                                {icon.glyph}
                              </span>
                            </td>
                            <td>{stat?.eligible ?? "—"}</td>
                            <td>{stat?.redeemed ?? "—"}</td>
                            <td>{pct}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </>
            ) : (
              <>
                {/* What was asked for, above what was delivered. Read-only:
                    acknowledging and progressing requests is sub-issue F. */}
                <h3 style={{ marginTop: 0 }}>Open benefit requests</h3>

                {(() => {
                  const openRequests = Object.values(partnerOpenRequests).sort(
                    (a, b) =>
                      new Date(b.requestedAt).getTime() -
                      new Date(a.requestedAt).getTime(),
                  );

                  if (openRequests.length === 0) {
                    return (
                      <p className="small">
                        No open benefit requests for this partner.
                      </p>
                    );
                  }

                  return (
                    <ul className="list-plain">
                      {openRequests.map((request) => (
                        <li
                          key={request.id}
                          className="tile"
                          style={{
                            padding: ".6rem .75rem",
                            marginBottom: ".5rem",
                          }}
                        >
                          <div className="cluster" style={{ alignItems: "center" }}>
                            <strong>
                              {benefitLabel(benefits, request.benefitCode)}
                            </strong>
                            <span className="pill">
                              {requestStatusLabel(request.status)}
                            </span>
                          </div>

                          <div className="small" style={{ marginTop: ".25rem" }}>
                            Requested by{" "}
                            {request.requestedByName ?? "Unknown contact"} on{" "}
                            {formatDateTimeGB(request.requestedAt)}
                          </div>

                          <p style={{ whiteSpace: "pre-wrap", margin: ".4rem 0 0" }}>
                            {request.note}
                          </p>

                          {request.preferredTimeframe && (
                            <p className="small" style={{ margin: ".4rem 0 0" }}>
                              Preferred timeframe: {request.preferredTimeframe}
                            </p>
                          )}
                          {request.contactPreference && (
                            <p className="small" style={{ margin: ".25rem 0 0" }}>
                              Best contact: {request.contactPreference}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  );
                })()}

                <p className="small">
                  Acknowledging and progressing requests from here is planned
                  for a later release — for now, action them with the partner
                  directly.
                </p>

                <h3 style={{ marginTop: "1.5rem" }}>
                  Benefit redemption checklist
                </h3>

                {selectedMember?.organisationId != null && (
                  <BenefitRedemptionChecklist
                    organisationId={selectedMember.organisationId}
                    organisationName={selectedMember.organisationName}
                    benefits={benefits}
                    memberRank={selectedMember.membershipTierRank}
                    redeemedCodes={selectedMember.redeemedBenefitCodes}
                    progress={partnerProgress}
                  />
                )}

                {selectedMember?.organisationId != null && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <BenefitPartnerNotes
                      organisationId={selectedMember.organisationId}
                      organisationName={selectedMember.organisationName}
                      benefits={benefits}
                      notes={partnerNotes}
                    />
                  </div>
                )}

                <div style={{ marginTop: "1.5rem" }}>
                  <h4 style={{ marginBottom: ".5rem" }}>
                    Benefit change history
                  </h4>

                  {benefitAuditTrail.length === 0 ? (
                    <p className="small">
                      No benefit changes have been recorded for this member yet.
                    </p>
                  ) : (
                    <ul className="list-plain">
                      {benefitAuditTrail.map((entry) => (
                        <li
                          key={entry.id}
                          className="tile"
                          style={{
                            padding: ".6rem .75rem",
                            marginBottom: ".5rem",
                          }}
                        >
                          <div className="small">
                            {formatDateTimeGB(entry.timestamp)} —{" "}
                            {auditActorLabel(entry)}
                          </div>

                          <div className="cluster" style={{ marginTop: ".4rem" }}>
                            {entry.added.map((code) => (
                              <span key={`added-${code}`} className="pill">
                                + {benefitLabel(benefits, code)}
                              </span>
                            ))}
                            {entry.removed.map((code) => (
                              <span key={`removed-${code}`} className="pill">
                                − {benefitLabel(benefits, code)}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Handbook panel */}
          <div
            role="tabpanel"
            id="panel-handbook"
            aria-labelledby="tab-handbook"
            className="tab-panel tab-panel--scroll"
            hidden={activeTab !== "handbook"}
          >
            {/* ToC page = two column layout; chapter pages = pager + content only */}
            {isTocPage ? (
              <div className="handbook-grid">
                <nav className="handbook-toc">
                  <h4 style={{ marginTop: 0 }}>Contents</h4>
                  <ol>
                    {handbook.chapters.map((c, idx) => (
                      <li key={c.slug}>
                        {c.slug === handbook.active.slug ? (
                          <strong aria-current="page">
                            {idx + 1}. {c.title}
                          </strong>
                        ) : (
                          <Link href={handbookHref(c.slug)}>
                            {idx + 1}. {c.title}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>

                <article className="handbook-content">
                  <div className="handbook-pager">
                    <button
                      className="button-link button-link--secondary"
                      disabled
                      aria-disabled="true"
                    >
                      Previous
                    </button>

                    <button
                      className="button-link button-link--secondary"
                      disabled
                      aria-disabled="true"
                    >
                      Table of contents
                    </button>

                    {handbook.next ? (
                      <Link
                        className="button-link button-link--secondary"
                        href={handbookHref(handbook.next.slug)}
                      >
                        Next
                      </Link>
                    ) : (
                      <button
                        className="button-link button-link--secondary"
                        disabled
                        aria-disabled="true"
                      >
                        Next
                      </button>
                    )}
                  </div>

                  <div
                    className="markdown-content"
                    dangerouslySetInnerHTML={{ __html: handbook.html }}
                  />
                </article>
              </div>
            ) : (
              <article className="handbook-content">
                <div className="handbook-pager">
                  {handbook.prev ? (
                    <Link
                      className="button-link button-link--secondary"
                      href={handbookHref(handbook.prev.slug)}
                    >
                      Previous
                    </Link>
                  ) : (
                    <button
                      className="button-link button-link--secondary"
                      disabled
                      aria-disabled="true"
                    >
                      Previous
                    </button>
                  )}

                  <Link
                    className="button-link button-link--secondary"
                    href={handbookHref(tocSlug)}
                  >
                    Table of contents
                  </Link>

                  {handbook.next ? (
                    <Link
                      className="button-link button-link--secondary"
                      href={handbookHref(handbook.next.slug)}
                    >
                      Next
                    </Link>
                  ) : (
                    <button
                      className="button-link button-link--secondary"
                      disabled
                      aria-disabled="true"
                    >
                      Next
                    </button>
                  )}
                </div>

                {/* No extra title here; Markdown owns the chapter heading */}
                <div
                  className="markdown-content"
                  dangerouslySetInnerHTML={{ __html: handbook.html }}
                />
              </article>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
