// src/lib/audit-log-admin.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import {
  AUDIT_ACTIONS,
  AUDIT_FILTER_ENTITY_TYPES,
  AUDIT_PAGE_SIZE,
  AUDIT_TIME_ZONE,
} from "@/lib/audit-log-shared";

/**
 * Read side of the AuditLog table, for the admin dashboard's audit tab.
 *
 * The other reader, getAdminBenefitAuditTrail in membership-dashboard-admin,
 * answers "what happened to this partner's benefits" — two entity types, one
 * organisation, newest 20. This one answers "what happened on the platform":
 * every entity type, filterable, paginated. They are deliberately separate;
 * neither is a generalisation of the other.
 *
 * Two properties this module has to hold onto:
 *
 * - It never throws on user input. The audit tab is a tab on a page that
 *   renders four other things, and there is no error.tsx anywhere under
 *   src/app, so an unhandled throw here blanks the whole admin dashboard
 *   rather than this panel. Every URL parameter goes through coercion that
 *   returns null on anything it does not recognise, and every row is formatted
 *   inside a try/catch.
 *
 * - It never assumes the shape of `data`. That column is Json? written by 20
 *   call sites with genuinely conflicting conventions (previous/next is
 *   string|null for notes but string[] for redemptions; added/removed is
 *   benefit codes in one place and numeric step ids in another), plus rows
 *   from a 2026-08 migration whose entityType no writer produces any more.
 *   Formatters test shapes at the point of use and fall through to a generic
 *   descriptor rather than guessing.
 */

// Timestamps are formatted here rather than in the client component, against
// the pinned zone — see the note on AUDIT_TIME_ZONE in audit-log-shared.
const auditTimestampFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: AUDIT_TIME_ZONE,
});

// Only these four key their entityId on Organisation.id. Note that the legacy
// MembershipDashboardMember rows do NOT belong here: the ones left behind by
// the 20260804140000 migration are precisely those whose entityId could not be
// resolved to an organisation, so it is still a User.id.
const ORGANISATION_SCOPED_ENTITY_TYPES = new Set<string>([
  "OrganisationBenefitNote",
  "OrganisationBenefitRedemption",
  "OrganisationBenefitRequest",
  "OrganisationBenefitActionProgress",
]);

const RAW_JSON_LIMIT = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditDetailPair = { label: string; value: string };

export type AuditLogRow = {
  id: string;
  timestampLabel: string;
  /** For a <time dateTime> attribute; the label above is the display value. */
  timestampIso: string;

  entityType: string;
  entityId: string;
  action: string;

  /** Non-null only when the actor account still exists — filterable. */
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorDeleted: boolean;

  /** One line describing what happened, already resolved to human terms. */
  summary: string;
  /** What the row is about (a partner name, a user's email), when knowable. */
  subject: string | null;
  /** Present when the row concerns a catalogue benefit, so the panel can
   *  decorate it with a label it already has the catalogue for. */
  benefitCode: string | null;

  details: AuditDetailPair[];
  ipAddress: string | null;
  userAgent: string | null;
  raw: string;
};

export type AuditLogFilters = {
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  actorId: string | null;
  /** Inclusive lower bound, at Europe/London midnight. */
  from: Date | null;
  /** Exclusive upper bound — Europe/London midnight the day after `toInput`. */
  toExclusive: Date | null;
  /** The accepted yyyy-mm-dd strings, so the form re-renders what was applied. */
  fromInput: string;
  toInput: string;
  before: AuditCursor | null;
  after: AuditCursor | null;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  hasNewer: boolean;
  hasOlder: boolean;
  /** Pass back as ?auditAfter= to walk towards the present. */
  newerCursor: string | null;
  /** Pass back as ?auditBefore= to walk into the past. */
  olderCursor: string | null;
  filters: AuditLogFilters;
  pageSize: number;
};

type AuditCursor = { timestamp: Date; id: string };

type RawSearchParams = { [key: string]: string | string[] | undefined };

// ---------------------------------------------------------------------------
// Shape guards. Same idiom as membership-dashboard-admin's asStringArray /
// asStringOrNull, extended for the shapes this module meets.
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function asNumberArray(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number")
    : [];
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 0 ? v : "(empty)";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "(unrenderable)";
  }
}

function rawJson(data: unknown): string {
  try {
    const s = JSON.stringify(data ?? null, null, 2);
    if (typeof s !== "string") return "null";
    return s.length > RAW_JSON_LIMIT
      ? `${s.slice(0, RAW_JSON_LIMIT)}\n… truncated`
      : s;
  } catch {
    return "Could not render this row's data as JSON.";
  }
}

function listOrDash(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

// ---------------------------------------------------------------------------
// Date handling
// ---------------------------------------------------------------------------

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/** Europe/London's UTC offset, in minutes, at a given instant. */
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AUDIT_TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * The UTC instant of Europe/London midnight on a yyyy-mm-dd date.
 *
 * Parsing the input as UTC midnight would be an hour out through BST, so an
 * admin filtering "from today" would silently miss everything logged between
 * midnight and 1am. Two passes because the offset at the naive guess is right
 * except within an hour of a DST transition, where correcting by it lands the
 * instant in the other offset.
 */
function londonStartOfDay(input: string): Date | null {
  if (!DATE_INPUT.test(input)) return null;
  const guess = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const first = new Date(guess.getTime() - londonOffsetMinutes(guess) * 60_000);
  return new Date(guess.getTime() - londonOffsetMinutes(first) * 60_000);
}

/** Calendar-safe next day, done on the date string rather than by adding 24h. */
function nextDayInput(input: string): string | null {
  if (!DATE_INPUT.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

/**
 * `<epoch ms>.<cuid>`. Epoch milliseconds round-trip TIMESTAMP(3) exactly and
 * carry no timezone to misread; cuids contain no dot, so the split is safe.
 */
export function encodeAuditCursor(row: { timestamp: Date; id: string }): string {
  return `${row.timestamp.getTime()}.${row.id}`;
}

function decodeAuditCursor(v: string | undefined): AuditCursor | null {
  if (!v) return null;
  const dot = v.indexOf(".");
  if (dot <= 0) return null;
  const ms = Number(v.slice(0, dot));
  const id = v.slice(dot + 1);
  if (!Number.isSafeInteger(ms) || ms < 0 || id.length === 0) return null;
  const timestamp = new Date(ms);
  if (Number.isNaN(timestamp.getTime())) return null;
  return { timestamp, id };
}

// ---------------------------------------------------------------------------
// Filter coercion
// ---------------------------------------------------------------------------

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function pickFromAllowList(
  v: string | undefined,
  allowed: readonly string[],
): string | null {
  return v && allowed.includes(v) ? v : null;
}

/** An opaque id from the row in front of the admin — bounded, not validated. */
function pickId(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return trimmed;
}

/**
 * Total: returns a usable filter set for any input at all. Anything
 * unrecognised is dropped rather than rejected, because the alternative is
 * throwing inside a server component that has no error boundary above it.
 */
export function coerceAuditFilters(
  sp: RawSearchParams | undefined,
): AuditLogFilters {
  const fromInput = pickFirst(sp?.auditFrom) ?? "";
  const toInput = pickFirst(sp?.auditTo) ?? "";

  const from = DATE_INPUT.test(fromInput) ? londonStartOfDay(fromInput) : null;

  // Inclusive upper bound in the UI, exclusive in the query: "to 10 Sept"
  // has to include everything logged on the 10th.
  const toNext = DATE_INPUT.test(toInput) ? nextDayInput(toInput) : null;
  const toExclusive = toNext ? londonStartOfDay(toNext) : null;

  return {
    entityType: pickFromAllowList(
      pickFirst(sp?.auditEntity),
      AUDIT_FILTER_ENTITY_TYPES,
    ),
    entityId: pickId(pickFirst(sp?.auditEntityId)),
    action: pickFromAllowList(pickFirst(sp?.auditAction), AUDIT_ACTIONS),
    actorId: pickId(pickFirst(sp?.auditActor)),
    from,
    toExclusive,
    // Only echo back dates that actually parsed, so a rejected value clears
    // the input rather than sitting there looking applied.
    fromInput: from ? fromInput : "",
    toInput: toExclusive ? toInput : "",
    before: decodeAuditCursor(pickFirst(sp?.auditBefore)),
    after: decodeAuditCursor(pickFirst(sp?.auditAfter)),
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function buildWhere(f: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (f.entityType) where.entityType = f.entityType;
  if (f.entityId) where.entityId = f.entityId;
  if (f.action) where.action = f.action;
  if (f.actorId) where.actorId = f.actorId;

  if (f.from || f.toExclusive) {
    where.timestamp = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.toExclusive ? { lt: f.toExclusive } : {}),
    };
  }

  // The keyset comparison goes in AND rather than merging into `timestamp`
  // above: it spans two columns, and both clauses can constrain timestamp.
  //
  // It is expressed in SQL and never in JS. `id` is text under the database's
  // collation, and a JavaScript string comparison is not guaranteed to agree
  // with the btree ordering the index and these operators use.
  const cursor = f.after ?? f.before;
  if (cursor) {
    const forward = f.after != null;
    where.AND = [
      {
        OR: [
          {
            timestamp: forward
              ? { gt: cursor.timestamp }
              : { lt: cursor.timestamp },
          },
          {
            timestamp: cursor.timestamp,
            id: forward ? { gt: cursor.id } : { lt: cursor.id },
          },
        ],
      },
    ];
  }

  return where;
}

const AUDIT_ROW_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  action: true,
  actorId: true,
  timestamp: true,
  data: true,
  ipAddress: true,
  userAgent: true,
  // A `select`, never `include: { actor: true }` — the latter pulls every
  // User column, passwordHash included, into the render process.
  actor: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type QueriedRow = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_ROW_SELECT;
}>;

function requireAdmin(roleKeys: unknown) {
  const keys = Array.isArray(roleKeys) ? roleKeys : [];
  if (!keys.includes("ADMIN")) {
    throw new Error("Admin access required.");
  }
}

/**
 * One page of the audit log, newest first.
 *
 * Keyset pagination on (timestamp, id) rather than offset. Offset's only
 * advantage is random access, and there is deliberately no count() here — a
 * total over a growing, mostly-unfiltered table is the one query that would
 * make this tab expensive — so there are no page numbers to jump to and the
 * advantage never materialises. Meanwhile LOGIN rows arrive on every sign-in,
 * so an offset window shifts under an admin who is paging through it.
 *
 * The sharper reason is that AuditLog.timestamp defaults to CURRENT_TIMESTAMP,
 * which is Postgres's *transaction* timestamp: rows written in one transaction
 * are equal to the millisecond, and saving benefit step progress writes three
 * of them. Ordering by timestamp alone is not a total order, so OFFSET can
 * duplicate or skip rows at a page boundary with no concurrent writes at all.
 */
export async function getAuditLogPage(
  sp: RawSearchParams | undefined,
): Promise<AuditLogPage> {
  // page.tsx already gates the whole admin branch on this, and the sibling
  // getAdmin* helpers rely on that gate rather than repeating it. This one
  // function is worth the deviation: it exposes every user's email, IP address
  // and user agent across the entire platform in a single call, and
  // getServerAuthSession costs no database round trip here.
  const session = await getServerAuthSession();
  const user = session?.user as { roleKeys?: unknown } | undefined;
  requireAdmin(user?.roleKeys);

  const filters = coerceAuditFilters(sp);
  const where = buildWhere(filters);

  // Walking towards the present reads ascending from the cursor, then flips
  // for display. Everything else reads descending.
  const forward = filters.after != null;

  const fetched = (await prisma.auditLog.findMany({
    where,
    orderBy: forward
      ? [{ timestamp: "asc" }, { id: "asc" }]
      : [{ timestamp: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    select: AUDIT_ROW_SELECT,
  })) as QueriedRow[];

  const overflowed = fetched.length > AUDIT_PAGE_SIZE;
  const windowed = overflowed ? fetched.slice(0, AUDIT_PAGE_SIZE) : fetched;
  const ordered = forward ? [...windowed].reverse() : windowed;

  // Walking back towards the present can land on a short page; rather than
  // spend a second round trip squaring that up on a connection_limit=1 pool,
  // the panel offers a "Newest" button that clears both cursors.
  const hasNewer = forward ? overflowed : filters.before != null;
  const hasOlder = forward ? true : overflowed;

  const organisationNameById = await loadOrganisationNames(ordered);

  const rows = ordered.map((row) =>
    buildAuditLogRow(row, organisationNameById),
  );

  return {
    rows,
    hasNewer,
    hasOlder,
    newerCursor: ordered.length > 0 ? encodeAuditCursor(ordered[0]) : null,
    olderCursor:
      ordered.length > 0
        ? encodeAuditCursor(ordered[ordered.length - 1])
        : null,
    filters,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

/**
 * Organisation names for the rows on this page. The four Organisation* entity
 * types are the only ones whose subject is not already spelled out in `data`
 * — User rows carry targetEmail, Benefit rows carry code, PlatformSetting's
 * entityId is the setting key.
 *
 * Deliberately a query rather than reusing the dashboard's existing member
 * list client-side: that list only covers organisations holding an active
 * membership with a MEMBER contact, so a lapsed partner's history would render
 * as "Organisation #12" — precisely the history an audit log is consulted for.
 */
async function loadOrganisationNames(
  rows: QueriedRow[],
): Promise<Map<number, string>> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => ORGANISATION_SCOPED_ENTITY_TYPES.has(r.entityType))
        .map((r) => Number(r.entityId))
        .filter((n) => Number.isInteger(n)),
    ),
  ];

  if (ids.length === 0) return new Map();

  const organisations = await prisma.organisation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  return new Map(organisations.map((o) => [o.id, o.name]));
}

function buildAuditLogRow(
  row: QueriedRow,
  organisationNameById: Map<number, string>,
): AuditLogRow {
  const data = asRecord(row.data);

  // actorId is ON DELETE SET NULL, so a departed admin's rows keep only the
  // email every write site denormalises into data.
  const denormalisedEmail = asStringOrNull(data.actorEmail);
  const actorDeleted = row.actor == null;

  let described: DescribedRow;
  try {
    described = describeAuditRow(row, data, organisationNameById);
  } catch {
    // One malformed row must never take the tab down with it, let alone the
    // dashboard around it. The raw JSON below still carries the full record.
    described = {
      summary: `${row.action} on ${row.entityType}`,
      subject: null,
      benefitCode: null,
      details: [],
    };
  }

  return {
    id: row.id,
    timestampLabel: auditTimestampFormat.format(row.timestamp),
    timestampIso: row.timestamp.toISOString(),

    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,

    actorId: row.actorId,
    actorName: row.actor
      ? `${row.actor.firstName} ${row.actor.lastName}`.trim()
      : null,
    actorEmail: row.actor?.email ?? denormalisedEmail,
    actorDeleted,

    summary: described.summary,
    subject: described.subject,
    benefitCode: described.benefitCode,
    details: described.details,

    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    raw: rawJson(row.data),
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

type DescribedRow = {
  summary: string;
  subject: string | null;
  benefitCode: string | null;
  details: AuditDetailPair[];
};

function generic(row: QueriedRow): DescribedRow {
  return {
    summary: `${row.action} on ${row.entityType}`,
    subject: null,
    benefitCode: null,
    details: [],
  };
}

function describeAuditRow(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): DescribedRow {
  switch (row.entityType) {
    case "User":
      return describeUserRow(row, data);
    case "Benefit":
      return describeBenefitRow(row, data);
    case "PlatformSetting":
      return describePlatformSettingRow(row, data);
    case "OrganisationBenefitNote":
      return describeNoteRow(row, data, organisationNameById);
    // The rows the 20260804140000 migration left behind carry exactly the old
    // redemption shape, so they read correctly through the same formatter.
    case "OrganisationBenefitRedemption":
    case "MembershipDashboardMember":
      return describeRedemptionRow(row, data, organisationNameById);
    case "OrganisationBenefitRequest":
      return describeRequestRow(row, data, organisationNameById);
    case "OrganisationBenefitActionProgress":
      return describeProgressRow(row, data, organisationNameById);
    default:
      return generic(row);
  }
}

function organisationSubject(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): string {
  const id = Number(row.entityId);
  if (Number.isInteger(id)) {
    const name = organisationNameById.get(id);
    if (name) return name;
    return `Organisation #${id}`;
  }
  // Legacy rows keyed on a User.id rather than an organisation.
  const legacyFrom = asStringOrNull(data.migratedFromEntityType);
  return legacyFrom ? `${legacyFrom} ${row.entityId}` : row.entityId;
}

// --- User ------------------------------------------------------------------

function describeUserRow(
  row: QueriedRow,
  data: Record<string, unknown>,
): DescribedRow {
  const subject =
    asStringOrNull(data.targetEmail) ??
    asStringOrNull(data.email) ??
    asStringOrNull(data.targetName) ??
    row.entityId;

  const base = { subject, benefitCode: null };

  switch (row.action) {
    case "LOGIN":
      return { ...base, summary: "Signed in", details: [] };

    case "CREATE":
      return {
        ...base,
        summary: `Created user ${subject}`,
        details: [
          { label: "Name", value: renderValue(
            [asStringOrNull(data.firstName), asStringOrNull(data.lastName)]
              .filter(Boolean)
              .join(" ") || null,
          ) },
          { label: "Email", value: renderValue(data.email) },
        ],
      };

    case "DELETE": {
      const selfDelete = data.selfDelete === true;
      return {
        ...base,
        summary: selfDelete
          ? `Deleted their own account (${subject})`
          : `Deleted user ${subject}`,
        details: [
          { label: "Name", value: renderValue(data.targetName) },
          { label: "Email", value: renderValue(data.targetEmail) },
          { label: "Self-delete", value: selfDelete ? "Yes" : "No" },
        ],
      };
    }

    case "PASSWORD_CHANGE":
      return { ...base, summary: "Changed their own password", details: [] };

    case "PASSWORD_RESET":
      return {
        ...base,
        summary: `Reset the password for ${subject}`,
        details: [],
      };

    case "UPDATE":
      return { ...base, ...describeUserChanges(data), subject };

    default:
      return { ...base, summary: `${row.action} on user ${subject}`, details: [] };
  }
}

function describeUserChanges(
  data: Record<string, unknown>,
): { summary: string; details: AuditDetailPair[] } {
  const changes = asRecord(data.changes);
  const subject =
    asStringOrNull(data.targetEmail) ?? asStringOrNull(data.email) ?? "user";

  const sections: string[] = [];
  const details: AuditDetailPair[] = [];

  if ("user" in changes) {
    const section = asRecord(changes.user);
    const previous = asRecord(section.previous);
    const next = asRecord(section.next);
    const fields = [
      ...new Set([...Object.keys(previous), ...Object.keys(next)]),
    ].sort();

    if (fields.length > 0) {
      sections.push(`details (${fields.join(", ")})`);
      for (const field of fields) {
        details.push({
          label: field,
          value: `${renderValue(previous[field])} → ${renderValue(next[field])}`,
        });
      }
    }
  }

  if ("roles" in changes) {
    const section = asRecord(changes.roles);
    const added = asStringArray(section.added);
    const removed = asStringArray(section.removed);
    if (added.length > 0 || removed.length > 0) {
      sections.push("roles");
      details.push({ label: "Roles added", value: listOrDash(added) });
      details.push({ label: "Roles removed", value: listOrDash(removed) });
    }
  }

  if ("membership" in changes) {
    const section = asRecord(changes.membership);
    sections.push("membership");
    details.push({
      label: "Membership before",
      value: renderValue(section.previous),
    });
    details.push({ label: "Membership after", value: renderValue(section.next) });
  }

  if (sections.length === 0) {
    return { summary: `Updated ${subject}`, details };
  }

  return { summary: `Updated ${subject}: ${sections.join(", ")}`, details };
}

// --- Benefit ---------------------------------------------------------------

/**
 * Dispatches on the shape of `changes`, never on the action verb. A Benefit
 * row with action DELETE is a *step* removal — there is no benefit-delete path
 * in the app at all, and retire/restore is an UPDATE carrying isActive. Naming
 * the verb here would put "Deleted benefit B07" in an audit log for something
 * that never happened.
 */
function describeBenefitRow(
  row: QueriedRow,
  data: Record<string, unknown>,
): DescribedRow {
  const code = asStringOrNull(data.code);
  const subject = code ?? `Benefit #${row.entityId}`;
  const base = { subject, benefitCode: code };

  // CREATE is the one Benefit site whose payload key is `next`, not `changes`.
  if ("next" in data && !("changes" in data)) {
    const next = asRecord(data.next);
    return {
      ...base,
      summary: `Created benefit ${subject}`,
      details: [
        { label: "Label", value: renderValue(next.label) },
        { label: "Category", value: renderValue(next.category) },
        { label: "Minimum tier", value: renderValue(next.tierMinId) },
      ],
    };
  }

  const changes = asRecord(data.changes);

  if ("steps" in changes) {
    const steps = asRecord(changes.steps);

    if ("added" in steps) {
      const added = Array.isArray(steps.added) ? steps.added : [];
      return {
        ...base,
        summary: `Added ${added.length === 1 ? "a step" : `${added.length} steps`} to ${subject}`,
        details: added.map((s, i) => ({
          label: `Step ${asRecord(s).position ?? i + 1}`,
          value: renderValue(asRecord(s).body),
        })),
      };
    }

    if ("edited" in steps) {
      const edited = Array.isArray(steps.edited) ? steps.edited : [];
      return {
        ...base,
        summary: `Edited ${edited.length === 1 ? "a step" : `${edited.length} steps`} on ${subject}`,
        details: edited.map((s, i) => {
          const step = asRecord(s);
          return {
            label: `Step ${step.position ?? i + 1}`,
            value: `${renderValue(step.previous)} → ${renderValue(step.next)}`,
          };
        }),
      };
    }

    if ("removed" in steps) {
      const removed = Array.isArray(steps.removed) ? steps.removed : [];
      return {
        ...base,
        summary: `Removed ${removed.length === 1 ? "a step" : `${removed.length} steps`} from ${subject}`,
        details: removed.map((s, i) => ({
          label: `Step ${asRecord(s).position ?? i + 1}`,
          value: renderValue(asRecord(s).body),
        })),
      };
    }

    if ("reordered" in steps) {
      const reordered = asRecord(steps.reordered);
      return {
        ...base,
        summary: `Reordered the steps on ${subject}`,
        details: [
          { label: "Before", value: listOrDash(asNumberArray(reordered.previous).map(String)) },
          { label: "After", value: listOrDash(asNumberArray(reordered.next).map(String)) },
        ],
      };
    }
  }

  if ("benefit" in changes) {
    const section = asRecord(changes.benefit);
    const previous = asRecord(section.previous);
    const next = asRecord(section.next);
    const fields = [
      ...new Set([...Object.keys(previous), ...Object.keys(next)]),
    ].sort();

    // Retire/restore is an isActive-only UPDATE, and reads far better named.
    if (fields.length === 1 && fields[0] === "isActive") {
      return {
        ...base,
        summary:
          next.isActive === true
            ? `Restored benefit ${subject}`
            : `Retired benefit ${subject}`,
        details: [],
      };
    }

    return {
      ...base,
      summary: `Edited benefit ${subject} (${fields.join(", ") || "no fields"})`,
      details: fields.map((field) => ({
        label: field,
        value: `${renderValue(previous[field])} → ${renderValue(next[field])}`,
      })),
    };
  }

  return { ...base, summary: `${row.action} on benefit ${subject}`, details: [] };
}

// --- PlatformSetting -------------------------------------------------------

function describePlatformSettingRow(
  row: QueriedRow,
  data: Record<string, unknown>,
): DescribedRow {
  // entityId is the setting key itself, not a row id.
  const key = row.entityId;
  const section = asRecord(asRecord(data.changes).setting);
  const previous = asStringOrNull(asRecord(section.previous).value);
  const next = asStringOrNull(asRecord(section.next).value);

  const summary =
    next === null
      ? `Cleared the ${key} setting`
      : previous === null
        ? `Set ${key}`
        : `Changed ${key}`;

  return {
    summary,
    subject: key,
    benefitCode: null,
    details: [
      { label: "Before", value: renderValue(previous) },
      { label: "After", value: renderValue(next) },
    ],
  };
}

// --- Organisation-scoped ---------------------------------------------------

function describeNoteRow(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): DescribedRow {
  const subject = organisationSubject(row, data, organisationNameById);
  const code = asStringOrNull(data.benefitCode);

  // previous/next are string|null here — the same keys hold string[] on a
  // redemption row, which is why nothing shared reads them.
  const previous = asStringOrNull(data.previous);
  const next = asStringOrNull(data.next);

  const verb =
    row.action === "CREATE"
      ? "Added"
      : row.action === "DELETE"
        ? "Removed"
        : "Edited";

  return {
    summary: `${verb} the partner note on ${code ?? "a benefit"} for ${subject}`,
    subject,
    benefitCode: code,
    details: [
      { label: "Before", value: renderValue(previous) },
      { label: "After", value: renderValue(next) },
    ],
  };
}

function describeRedemptionRow(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): DescribedRow {
  const subject = organisationSubject(row, data, organisationNameById);

  // Benefit codes here — the same keys carry numeric step ids on a progress row.
  const added = asStringArray(data.added);
  const removed = asStringArray(data.removed);
  const code = added[0] ?? removed[0] ?? null;

  const summary =
    added.length > 0
      ? `Marked ${listOrDash(added)} redeemed for ${subject}`
      : removed.length > 0
        ? `Marked ${listOrDash(removed)} not redeemed for ${subject}`
        : `Updated redeemed benefits for ${subject}`;

  return {
    summary,
    subject,
    benefitCode: code,
    details: [
      { label: "Before", value: listOrDash(asStringArray(data.previous)) },
      { label: "After", value: listOrDash(asStringArray(data.next)) },
    ],
  };
}

function describeProgressRow(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): DescribedRow {
  const subject = organisationSubject(row, data, organisationNameById);
  const code = asStringOrNull(data.benefitCode);

  // Numeric BenefitAction ids, not codes.
  const added = asNumberArray(data.added);
  const removed = asNumberArray(data.removed);

  const ticked = added.length;
  const unticked = removed.length;
  const parts: string[] = [];
  if (ticked > 0) parts.push(`completed ${ticked} step${ticked === 1 ? "" : "s"}`);
  if (unticked > 0) {
    parts.push(`reopened ${unticked} step${unticked === 1 ? "" : "s"}`);
  }

  return {
    summary:
      parts.length > 0
        ? `${subject}: ${parts.join(", ")} on ${code ?? "a benefit"}`
        : `Updated step progress on ${code ?? "a benefit"} for ${subject}`,
    subject,
    benefitCode: code,
    details: [
      { label: "Steps completed", value: listOrDash(added.map(String)) },
      { label: "Steps reopened", value: listOrDash(removed.map(String)) },
    ],
  };
}

function describeRequestRow(
  row: QueriedRow,
  data: Record<string, unknown>,
  organisationNameById: Map<number, string>,
): DescribedRow {
  const subject = organisationSubject(row, data, organisationNameById);
  const code = asStringOrNull(data.benefitCode);
  const previousStatus = asStringOrNull(data.previousStatus);
  const nextStatus = asStringOrNull(data.nextStatus);
  const reason = asStringOrNull(data.reason);
  const reasonText = asStringOrNull(data.reasonText);

  // RAISED is the member's own act, not an admin's, and carries no transition.
  const verb =
    row.action === "BENEFIT_REQUEST_RAISED"
      ? "Requested"
      : row.action === "BENEFIT_REQUEST_ACKNOWLEDGED"
        ? "Acknowledged the request for"
        : row.action === "BENEFIT_REQUEST_STARTED"
          ? "Started work on"
          : row.action === "BENEFIT_REQUEST_CLOSED"
            ? "Closed the request for"
            : `${row.action} on`;

  const details: AuditDetailPair[] = [
    { label: "Request", value: renderValue(data.requestId) },
  ];
  if (previousStatus || nextStatus) {
    details.push({
      label: "Status",
      value: `${renderValue(previousStatus)} → ${renderValue(nextStatus)}`,
    });
  }
  if (reason) details.push({ label: "Reason", value: reason });
  if (reasonText) details.push({ label: "Note", value: reasonText });

  return {
    summary: `${verb} ${code ?? "a benefit"} for ${subject}`,
    subject,
    benefitCode: code,
    details,
  };
}
