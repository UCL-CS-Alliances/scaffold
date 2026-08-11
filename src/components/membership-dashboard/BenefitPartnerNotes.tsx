// src/components/membership-dashboard/BenefitPartnerNotes.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CatalogueBenefit } from "@/lib/benefits";
import { saveBenefitPartnerNoteAction } from "@/lib/membership-dashboard-actions";

// Server actions throw on failure; the message is shown as-is in development
// but masked by Next.js in production, so keep a usable fallback.
function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : "The note could not be saved.";
}

function NoteRow(props: {
  organisationId: number;
  code: string;
  label: string;
  retired?: boolean;
  /** The stored note body, "" when there is none. */
  serverBody: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Keyed on the server body by the parent, so a saved or colleague-changed
  // note remounts the row fresh rather than resyncing via an effect.
  const [draft, setDraft] = useState(props.serverBody);
  const [error, setError] = useState<string | null>(null);

  const hasNote = props.serverBody !== "";
  const dirty = draft.trim() !== props.serverBody;

  function save(body: string) {
    startTransition(async () => {
      try {
        await saveBenefitPartnerNoteAction({
          organisationId: props.organisationId,
          benefitCode: props.code,
          body,
        });
        setError(null);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  function clear() {
    const confirmed = window.confirm(
      "Clear this note? It disappears from the partner's benefit page. " +
        "The change is recorded in the audit trail.",
    );
    if (!confirmed) return;
    save("");
  }

  return (
    <details
      className="tile"
      style={{ padding: ".5rem .75rem", marginBottom: ".5rem" }}
    >
      <summary>
        <strong>{props.label}</strong>
        {props.retired && <span className="small"> (retired benefit)</span>}{" "}
        {hasNote && <span className="pill">Has note</span>}
      </summary>

      <textarea
        className="auth-input"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Note for ${props.label}`}
        style={{ marginTop: ".5rem", width: "100%" }}
      />

      <div className="cluster" style={{ marginTop: ".5rem" }}>
        <button
          type="button"
          className="button-link"
          disabled={isPending || !dirty}
          aria-disabled={isPending || !dirty ? "true" : undefined}
          onClick={() => save(draft)}
        >
          Save note
        </button>
        {hasNote && (
          <button
            type="button"
            className="button-link button-link--secondary"
            disabled={isPending}
            onClick={clear}
          >
            Clear note
          </button>
        )}
        {isPending && <span className="small">Saving…</span>}
      </div>

      {error && (
        <p className="small" role="alert" style={{ marginTop: ".5rem" }}>
          {error}
        </p>
      )}
    </details>
  );
}

/**
 * Admin editor for one partner's per-benefit notes (phase D). Each note is
 * saved on its own, per benefit — never as one bulk form — so saving one note
 * cannot silently overwrite a colleague's concurrent edit to a different one.
 */
export default function BenefitPartnerNotes(props: {
  organisationId: number;
  organisationName: string | null;
  benefits: CatalogueBenefit[];
  notes: Record<string, string>;
}) {
  const { organisationId, organisationName, benefits, notes } = props;

  // A note can exist against a benefit that has since been retired; the
  // active catalogue no longer lists it, but the note is still shown to the
  // partner on that benefit's page, so it must stay editable and clearable.
  const orphanCodes = Object.keys(notes)
    .filter((code) => !benefits.some((b) => b.id === code))
    .sort();

  return (
    <div>
      <h4 style={{ marginBottom: ".5rem" }}>Benefit notes</h4>

      <p className="small" style={{ margin: "0 0 .75rem" }}>
        A note appears on that benefit&apos;s detail page for{" "}
        <strong>
          every contact at {organisationName ?? "this organisation"}
        </strong>{" "}
        — it belongs to the organisation, not to one person, and members
        cannot edit it. Notes are shown even on benefits the partner cannot
        currently use.
      </p>

      {benefits.map((b) => (
        <NoteRow
          key={`${b.id}:${notes[b.id] ?? ""}`}
          organisationId={organisationId}
          code={b.id}
          label={b.label}
          serverBody={notes[b.id] ?? ""}
        />
      ))}

      {orphanCodes.map((code) => (
        <NoteRow
          key={`${code}:${notes[code]}`}
          organisationId={organisationId}
          code={code}
          label={code}
          retired
          serverBody={notes[code]}
        />
      ))}
    </div>
  );
}
