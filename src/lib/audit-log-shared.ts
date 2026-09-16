// src/lib/audit-log-shared.ts
//
// Audit log constants shared by the server writer/reader and the admin client
// component.
//
// This module must import nothing. Its two neighbours cannot be imported from a
// client component — audit-log.ts pulls in next/headers, audit-log-admin.ts
// pulls in the Prisma client — so anything the audit tab's UI needs as a *value*
// (rather than a type, which is erased at compile time) has to live here.

/**
 * Schema's AuditLog.action is a bare String; these are the values the write
 * sites produce. A const array rather than a bare union so the filter dropdown
 * and the writers share one source of truth.
 */
export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "PASSWORD_RESET",
  "PASSWORD_CHANGE",
  "BENEFIT_REQUEST_RAISED",
  "BENEFIT_REQUEST_ACKNOWLEDGED",
  "BENEFIT_REQUEST_STARTED",
  "BENEFIT_REQUEST_CLOSED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** entityType is likewise a bare String. These are what the writers produce. */
export const AUDIT_ENTITY_TYPES = [
  "User",
  "Benefit",
  "PlatformSetting",
  "OrganisationBenefitNote",
  "OrganisationBenefitRedemption",
  "OrganisationBenefitRequest",
  "OrganisationBenefitActionProgress",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/**
 * Entity types no write site produces any more, but which still exist in the
 * table. `20260804140000_organisation_scoped_membership_contract` re-keyed
 * MembershipDashboardMember rows to OrganisationBenefitRedemption, but only
 * those whose entityId still matched a live User with an organisation — its
 * comment records that the rest "are deliberately left alone rather than
 * deleted". So the reader has to offer them, or that history stays unreachable
 * from the UI for the same reason it became unreachable from the query.
 */
export const LEGACY_AUDIT_ENTITY_TYPES = ["MembershipDashboardMember"] as const;

export type LegacyAuditEntityType = (typeof LEGACY_AUDIT_ENTITY_TYPES)[number];

/** Everything the entity type filter offers, live and legacy. */
export const AUDIT_FILTER_ENTITY_TYPES: readonly string[] = [
  ...AUDIT_ENTITY_TYPES,
  ...LEGACY_AUDIT_ENTITY_TYPES,
];

/**
 * URL parameters the audit tab owns. Namespaced so they cannot collide with
 * the dashboard's existing `tab`, `view` and `userId`, and enumerated so the
 * client can clear the whole set in one go — applying a filter has to drop the
 * pagination cursor, or changing the entity type while paged deep lands on an
 * empty page of a shorter result set.
 */
export const AUDIT_FILTER_PARAM_KEYS = [
  "auditEntity",
  "auditEntityId",
  "auditAction",
  "auditActor",
  "auditFrom",
  "auditTo",
  "auditBefore",
  "auditAfter",
] as const;

/**
 * Audit timestamps are formatted server-side in this zone and never with the
 * ambient one. formatDateTimeGB in AdminDashboardClient and
 * formatLastSignInLabel in membership-dashboard-admin both call Intl with no
 * timeZone, so they resolve to the server's zone during SSR (UTC on Vercel)
 * and the browser's on hydration — an hour apart through BST. That is a latent
 * hydration mismatch elsewhere; on an audit log it would be a wrong answer.
 */
export const AUDIT_TIME_ZONE = "Europe/London";

export const AUDIT_PAGE_SIZE = 25;
