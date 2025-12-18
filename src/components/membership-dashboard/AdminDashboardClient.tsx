// src/components/membership-dashboard/AdminDashboardClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BENEFITS, type BenefitId } from "@/content/benefits";
import type {
  AdminBenefitRedemptionStat,
  AdminMemberListItem,
  AdminSelectedMember,
} from "@/lib/membership-dashboard-admin";
import type { HandbookRenderResult } from "@/lib/handbook";
import { canAccessBenefit } from "@/lib/membership-dashboard-admin";
import { saveRedeemedBenefitsAction } from "@/lib/membership-dashboard-actions";

type TabKey = "members" | "benefits" | "handbook";

function asTabKey(v: string | null | undefined): TabKey | null {
  if (v === "members" || v === "benefits" || v === "handbook") return v;
  return null;
}

function formatDateGB(d: Date | string | null | undefined) {
  if (!d) return "Not set";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
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
  benefitStats: AdminBenefitRedemptionStat[];
  initialTab?: string | null;
  handbook: HandbookRenderResult;
}) {
  const {
    members,
    selectedUserId,
    selectedMember,
    benefitStats,
    initialTab,
    handbook,
  } = props;

  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  // Keep client tab in sync if URL tab changes
  useEffect(() => {
    const next = asTabKey(sp?.get("tab"));
    if (next && next !== activeTab) setActiveTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const hasSelection = Boolean(selectedUserId && selectedMember);

  function pushWithParams(nextParams: URLSearchParams) {
    router.replace(`/membership-dashboard?${nextParams.toString()}`);
  }

  function setSelectedUser(nextUserId: string) {
    const params = new URLSearchParams(sp?.toString());
    if (!nextUserId) params.delete("userId");
    else params.set("userId", nextUserId);

    startTransition(() => {
      pushWithParams(params);
      router.refresh();
    });
  }

  function changeTab(next: TabKey) {
    setActiveTab(next);
    const params = new URLSearchParams(sp?.toString());
    params.set("tab", next);

    startTransition(() => {
      pushWithParams(params);
      router.refresh();
    });
  }

  const tierGroups = useMemo(() => {
    const map = new Map<string, AdminMemberListItem[]>();
    for (const m of members) {
      const key = m.tierLabel;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [members]);

  const benefitStatsMap = useMemo(() => {
    const m = new Map<string, AdminBenefitRedemptionStat>();
    benefitStats.forEach((s) => m.set(s.benefitId, s));
    return m;
  }, [benefitStats]);

  const [draftRedeemed, setDraftRedeemed] = useState<Set<BenefitId>>(
    new Set((selectedMember?.redeemedBenefitCodes ?? []) as BenefitId[]),
  );

  useEffect(() => {
    setDraftRedeemed(
      new Set((selectedMember?.redeemedBenefitCodes ?? []) as BenefitId[]),
    );
  }, [selectedUserId, selectedMember]);

  async function saveBenefits() {
    if (!selectedUserId) return;
    const redeemedBenefitCodes = Array.from(draftRedeemed);

    startTransition(async () => {
      await saveRedeemedBenefitsAction({
        userId: selectedUserId,
        redeemedBenefitCodes,
      });
      router.refresh();
    });
  }

  function handbookHref(chapterSlug: string) {
    const params = new URLSearchParams(sp?.toString());
    params.set("tab", "handbook");
    params.set("chapter", chapterSlug);
    return `/membership-dashboard?${params.toString()}`;
  }

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
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.organisationName} ({m.contactName})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Tabs + panels (no "Admin panels" heading) */}
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

                {tierGroups.map(([tierLabel, items]) => (
                  <details key={tierLabel} open>
                    <summary>
                      <strong>{tierLabel}</strong> ({items.length})
                    </summary>

                    <ul className="list-plain" style={{ marginTop: ".5rem" }}>
                      {items.map((m) => (
                        <li key={m.userId} style={{ marginBottom: ".35rem" }}>
                          <span>
                            <strong>{m.organisationName}</strong> ({m.contactName}) — Last sign-in:{" "}
                            <span>{m.lastSignedInLabel}</span>
                          </span>
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
                <h3 style={{ marginTop: 0 }}>Benefits overview</h3>

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
                      {BENEFITS.map((b) => {
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
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>Benefit redemption checklist</h3>

                <ul className="list-plain" style={{ marginTop: ".75rem" }}>
                  {BENEFITS.map((b) => {
                    const included = canAccessBenefit(
                      selectedMember?.membershipTierRank ?? null,
                      b.tierMin,
                    );
                    const checked = draftRedeemed.has(b.id);

                    if (!included) {
                      return (
                        <li
                          key={b.id}
                          className="tile"
                          style={{
                            padding: ".5rem .75rem",
                            marginBottom: ".5rem",
                          }}
                        >
                          <span role="img" aria-label="Locked">
                            🔒
                          </span>{" "}
                          <strong>{b.label}</strong>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={b.id}
                        className="tile"
                        style={{
                          padding: ".5rem .75rem",
                          marginBottom: ".5rem",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            gap: ".5rem",
                            alignItems: "flex-start",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(draftRedeemed);
                              if (e.target.checked) next.add(b.id);
                              else next.delete(b.id);
                              setDraftRedeemed(next);
                            }}
                          />
                          <span>
                            <strong>{b.label}</strong>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <div
                  style={{
                    display: "flex",
                    gap: ".75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="button-link"
                    onClick={saveBenefits}
                    disabled={isPending}
                    aria-disabled={isPending ? "true" : undefined}
                  >
                    Save changes
                  </button>
                  {isPending && <span className="small">Saving…</span>}
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
            <h3 style={{ marginTop: 0 }}>{handbook.active.title}</h3>

            <div className="handbook-grid">
              <nav className="handbook-toc">
                <h4 style={{ marginTop: 0 }}>Contents</h4>
                <ol>
                  {handbook.chapters.map((c) => (
                    <li key={c.slug}>
                      {c.slug === handbook.active.slug ? (
                        <strong aria-current="page">{c.title}</strong>
                      ) : (
                        <Link href={handbookHref(c.slug)}>{c.title}</Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>

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
                    href={handbookHref(handbook.chapters[0]?.slug ?? "toc")}
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

                <div
                  className="markdown-content"
                  dangerouslySetInnerHTML={{ __html: handbook.html }}
                />
              </article>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
