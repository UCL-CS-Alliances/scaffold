// src/components/membership-dashboard/AuditLogPanel.tsx
"use client";

import { useEffect, useState } from "react";
// Type-only from the server module (erased at compile time); every value comes
// from audit-log-shared, which imports nothing.
import type { AuditLogPage } from "@/lib/audit-log-admin";
import {
  AUDIT_ACTIONS,
  AUDIT_FILTER_ENTITY_TYPES,
  AUDIT_TIME_ZONE,
} from "@/lib/audit-log-shared";
import type { CatalogueBenefit } from "@/lib/benefits";

export type AuditFilterDraft = {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  from: string;
  to: string;
};

export type AuditPagerDirection = "newest" | "newer" | "older";

type Props = {
  /**
   * null means the server did not fetch on this render — either the tab is not
   * open, or a navigation to it is still in flight. It is deliberately not a
   * boolean: React keeps the previous props through a transition, so on first
   * entry this is null (and the panel says so) while a later filter change
   * keeps the previous page on screen until the new one lands.
   */
  page: AuditLogPage | null;
  isActive: boolean;
  isPending: boolean;
  benefits: CatalogueBenefit[];
  onApplyFilters: (draft: AuditFilterDraft) => void;
  onClearFilters: () => void;
  onPage: (direction: AuditPagerDirection) => void;
  onFilterByActor: (actorId: string) => void;
};

const EMPTY_DRAFT: AuditFilterDraft = {
  entityType: "",
  entityId: "",
  action: "",
  actorId: "",
  from: "",
  to: "",
};

// Entity types are stored as model names; these are what an admin calls them.
const ENTITY_TYPE_LABELS: Record<string, string> = {
  User: "User account",
  Benefit: "Benefit catalogue",
  PlatformSetting: "Platform setting",
  OrganisationBenefitNote: "Partner note",
  OrganisationBenefitRedemption: "Benefit redemption",
  OrganisationBenefitRequest: "Benefit request",
  OrganisationBenefitActionProgress: "Benefit step progress",
  MembershipDashboardMember: "Benefit redemption (legacy)",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  LOGIN: "Signed in",
  PASSWORD_RESET: "Password reset",
  PASSWORD_CHANGE: "Password changed",
  BENEFIT_REQUEST_RAISED: "Request raised",
  BENEFIT_REQUEST_ACKNOWLEDGED: "Request acknowledged",
  BENEFIT_REQUEST_STARTED: "Request started",
  BENEFIT_REQUEST_CLOSED: "Request closed",
};

function entityTypeLabel(v: string) {
  return ENTITY_TYPE_LABELS[v] ?? v;
}

function actionLabel(v: string) {
  return ACTION_LABELS[v] ?? v;
}

// Same fallback as the members tab's benefitLabel: a code whose benefit has
// since been retired is not in the member-facing catalogue, so show the code.
function benefitLabel(benefits: CatalogueBenefit[], code: string) {
  const label = benefits.find((b) => b.id === code)?.label;
  return label ? `${code} — ${label}` : code;
}

function draftFromPage(page: AuditLogPage | null): AuditFilterDraft {
  if (!page) return EMPTY_DRAFT;
  return {
    entityType: page.filters.entityType ?? "",
    entityId: page.filters.entityId ?? "",
    action: page.filters.action ?? "",
    actorId: page.filters.actorId ?? "",
    from: page.filters.fromInput,
    to: page.filters.toInput,
  };
}

/** Identity of the *applied* filter set, so local typing is not clobbered. */
function appliedFilterKey(page: AuditLogPage | null): string {
  const d = draftFromPage(page);
  return [d.entityType, d.entityId, d.action, d.actorId, d.from, d.to].join("|");
}

function hasAnyFilter(draft: AuditFilterDraft): boolean {
  return Object.values(draft).some((v) => v !== "");
}

export default function AuditLogPanel({
  page,
  isActive,
  isPending,
  benefits,
  onApplyFilters,
  onClearFilters,
  onPage,
  onFilterByActor,
}: Props) {
  const [draft, setDraft] = useState<AuditFilterDraft>(() =>
    draftFromPage(page),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Resync only when the *applied* filters change — i.e. when a navigation
  // actually lands. Depending on `page` itself would wipe half-typed input
  // every time an unrelated render arrived.
  const filterKey = appliedFilterKey(page);
  useEffect(() => {
    setDraft(draftFromPage(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Nothing to render until the tab is opened. The panel is always mounted
  // (its siblings are toggled with `hidden`), so this is the common case.
  if (!isActive) return null;

  function update<K extends keyof AuditFilterDraft>(
    key: K,
    value: AuditFilterDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Audit log</h3>
      <p className="small" style={{ maxWidth: "60ch" }}>
        Every recorded change across the platform, newest first, in UK time (
        {AUDIT_TIME_ZONE}). Changes saved together share a timestamp to the
        millisecond, so entries within the same moment are grouped rather than
        ordered. Sign-ins are recorded on a best-effort basis: a missing
        sign-in entry is not evidence that no sign-in happened.
      </p>

      <form
        className="audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          onApplyFilters(draft);
        }}
      >
        <div className="audit-filter-field">
          <label className="auth-label" htmlFor="audit-entity">
            Entity type
          </label>
          <select
            id="audit-entity"
            className="auth-input"
            value={draft.entityType}
            onChange={(e) => update("entityType", e.target.value)}
          >
            <option value="">All</option>
            {AUDIT_FILTER_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {entityTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="auth-label" htmlFor="audit-action">
            Action
          </label>
          <select
            id="audit-action"
            className="auth-input"
            value={draft.action}
            onChange={(e) => update("action", e.target.value)}
          >
            <option value="">All</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="auth-label" htmlFor="audit-from">
            From
          </label>
          <input
            id="audit-from"
            className="auth-input"
            type="date"
            value={draft.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </div>

        <div className="audit-filter-field">
          <label className="auth-label" htmlFor="audit-to">
            To
          </label>
          <input
            id="audit-to"
            className="auth-input"
            type="date"
            value={draft.to}
            onChange={(e) => update("to", e.target.value)}
          />
        </div>

        <div className="audit-filter-field">
          <label className="auth-label" htmlFor="audit-entity-id">
            Entity ID
          </label>
          <input
            id="audit-entity-id"
            className="auth-input"
            type="text"
            placeholder="Organisation or user ID"
            value={draft.entityId}
            onChange={(e) => update("entityId", e.target.value)}
          />
        </div>

        <div className="audit-filter-actions cluster">
          <button type="submit" className="button-link button-link--primary">
            Apply filters
          </button>
          <button
            type="button"
            className="button-link button-link--secondary"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              onClearFilters();
            }}
            disabled={!hasAnyFilter(draft)}
            aria-disabled={!hasAnyFilter(draft) ? "true" : undefined}
          >
            Clear
          </button>
        </div>
      </form>

      {draft.actorId && (
        <p className="small" style={{ marginTop: ".5rem" }}>
          Filtered to a single actor.{" "}
          <button
            type="button"
            className="auth-linklike"
            onClick={() => {
              setDraft((prev) => ({ ...prev, actorId: "" }));
              onApplyFilters({ ...draft, actorId: "" });
            }}
          >
            Show all actors
          </button>
        </p>
      )}

      <div aria-live="polite" aria-busy={isPending}>
        {page === null ? (
          <p className="small" style={{ marginTop: "1rem" }}>
            Loading the audit log…
          </p>
        ) : page.rows.length === 0 ? (
          <p className="small" style={{ marginTop: "1rem" }}>
            No audit entries match these filters.
          </p>
        ) : (
          <>
            {isPending && (
              <p className="small" style={{ marginTop: ".5rem" }}>
                Updating…
              </p>
            )}

            <Pager page={page} onPage={onPage} isPending={isPending} />

            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Platform audit log, newest first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">What happened</th>
                    <th scope="col">Type</th>
                    <th scope="col">Actor</th>
                    <th scope="col">
                      <span className="sr-only">Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => {
                    const expanded = expandedId === row.id;
                    return (
                      <AuditRow
                        key={row.id}
                        row={row}
                        expanded={expanded}
                        benefits={benefits}
                        onToggle={() =>
                          setExpandedId(expanded ? null : row.id)
                        }
                        onFilterByActor={onFilterByActor}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pager page={page} onPage={onPage} isPending={isPending} />
          </>
        )}
      </div>
    </div>
  );
}

function Pager({
  page,
  onPage,
  isPending,
}: {
  page: AuditLogPage;
  onPage: (direction: AuditPagerDirection) => void;
  isPending: boolean;
}) {
  return (
    <div
      className="cluster"
      style={{ marginTop: ".75rem", marginBottom: ".75rem" }}
    >
      <button
        type="button"
        className="button-link button-link--secondary"
        onClick={() => onPage("newest")}
        disabled={!page.hasNewer || isPending}
        aria-disabled={!page.hasNewer || isPending ? "true" : undefined}
      >
        Newest
      </button>
      <button
        type="button"
        className="button-link button-link--secondary"
        onClick={() => onPage("newer")}
        disabled={!page.hasNewer || isPending}
        aria-disabled={!page.hasNewer || isPending ? "true" : undefined}
      >
        ← Newer
      </button>
      <button
        type="button"
        className="button-link button-link--secondary"
        onClick={() => onPage("older")}
        disabled={!page.hasOlder || isPending}
        aria-disabled={!page.hasOlder || isPending ? "true" : undefined}
      >
        Older →
      </button>
      <span className="small">
        Showing up to {page.pageSize} entries
      </span>
    </div>
  );
}

function AuditRow({
  row,
  expanded,
  benefits,
  onToggle,
  onFilterByActor,
}: {
  row: AuditLogPage["rows"][number];
  expanded: boolean;
  benefits: CatalogueBenefit[];
  onToggle: () => void;
  onFilterByActor: (actorId: string) => void;
}) {
  const detailId = `audit-detail-${row.id}`;
  // Bound once so the click handler below narrows without a cast.
  const actorId = row.actorId;

  return (
    <>
      <tr>
        <td style={{ whiteSpace: "nowrap" }}>
          <time dateTime={row.timestampIso}>{row.timestampLabel}</time>
        </td>

        <td>
          {row.summary}
          {row.benefitCode && (
            <div className="small">{benefitLabel(benefits, row.benefitCode)}</div>
          )}
        </td>

        <td>
          <span className="audit-tag">{entityTypeLabel(row.entityType)}</span>{" "}
          <span className="audit-tag">{actionLabel(row.action)}</span>
        </td>

        <td>
          {row.actorDeleted ? (
            // No filter link: a deleted actor's actorId is NULL, and their
            // email survives only inside data.actorEmail. Filtering on that is
            // expressible but unindexed — a full scan plus a JSONB extraction
            // per row — so it is deliberately not offered here.
            <span>
              {row.actorEmail ?? "Unknown actor"}{" "}
              <span className="small">(deleted account)</span>
            </span>
          ) : actorId ? (
            <button
              type="button"
              className="auth-linklike"
              onClick={() => onFilterByActor(actorId)}
              title="Show only this actor's entries"
            >
              {row.actorName || row.actorEmail || "Unknown actor"}
            </button>
          ) : (
            <span>{row.actorEmail ?? "Unknown actor"}</span>
          )}
        </td>

        <td>
          <button
            type="button"
            className="auth-linklike"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailId}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr id={detailId}>
          <td colSpan={5}>
            <dl className="audit-detail-list">
              {row.subject && (
                <>
                  <dt>Subject</dt>
                  <dd>{row.subject}</dd>
                </>
              )}
              <dt>Entity</dt>
              <dd>
                {row.entityType} · {row.entityId}
              </dd>
              {row.details.map((d, i) => (
                <div key={`${d.label}-${i}`} style={{ display: "contents" }}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
              <dt>IP address</dt>
              <dd>{row.ipAddress ?? "Not recorded"}</dd>
              <dt>User agent</dt>
              <dd>{row.userAgent ?? "Not recorded"}</dd>
            </dl>

            <details style={{ marginTop: ".5rem" }}>
              <summary className="small">Raw record</summary>
              <pre className="audit-detail">{row.raw}</pre>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}
