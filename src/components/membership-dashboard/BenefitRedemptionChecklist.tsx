// src/components/membership-dashboard/BenefitRedemptionChecklist.tsx
"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { BenefitActionProgressMap, CatalogueBenefit } from "@/lib/benefits";
import { hasBenefitAccess } from "@/lib/benefit-access";
import {
  saveBenefitActionProgressAction,
  saveBenefitRedemptionAction,
} from "@/lib/membership-dashboard-actions";

// Server actions throw on failure; the message is shown as-is in development
// but masked by Next.js in production, so keep a usable fallback.
function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : "The change could not be saved.";
}

function formatDateGB(d: Date | string | null) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

// Clicks on the interactive parts of a <summary> must not toggle the
// dropdown; stopping propagation covers React handlers and the native
// details toggle skips form controls in current browsers.
function stopSummaryToggle(e: MouseEvent) {
  e.stopPropagation();
}

/**
 * A benefit with process steps. The redemption checkbox is a bulk toggle over
 * the step draft — redemption is *equivalent* to "all steps complete"
 * (decision 2026-08-12), and the server action enforces that: saving a full
 * tick-set marks the benefit redeemed, saving a broken one un-redeems it.
 */
function SteppedBenefitRow(props: {
  organisationId: number;
  benefit: CatalogueBenefit;
  progress: BenefitActionProgressMap;
  redeemed: boolean;
}) {
  const { organisationId, benefit, progress, redeemed } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const steps = benefit.process.actions;
  const serverTicked = new Set(
    steps.filter((s) => progress[s.id]).map((s) => s.id),
  );
  // Keyed by the parent on the saved state, so a save or a colleague's
  // change remounts the row fresh rather than resyncing via an effect.
  const [draft, setDraft] = useState<Set<number>>(() => new Set(serverTicked));

  const allTicked = steps.length > 0 && draft.size === steps.length;
  const dirty =
    draft.size !== serverTicked.size ||
    [...draft].some((id) => !serverTicked.has(id));

  // Pre-backfill legacy state (redeemed with unrecorded steps) or a tick-set
  // saved before the equivalence shipped. Saving the row syncs it.
  const outOfSync =
    !dirty && redeemed !== (steps.length > 0 && serverTicked.size === steps.length);

  function save() {
    startTransition(async () => {
      try {
        await saveBenefitActionProgressAction({
          organisationId,
          benefitCode: benefit.id,
          completedActionIds: [...draft],
        });
        setError(null);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  function toggleAll() {
    setDraft(allTicked ? new Set() : new Set(steps.map((s) => s.id)));
  }

  return (
    <li className="tile" style={{ padding: 0, marginBottom: ".5rem" }}>
      <details>
        <summary
          style={{
            display: "flex",
            gap: ".5rem",
            alignItems: "center",
            flexWrap: "wrap",
            padding: ".5rem .75rem",
          }}
        >
          <label
            onClick={stopSummaryToggle}
            style={{ display: "flex", gap: ".5rem", alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={allTicked}
              onChange={toggleAll}
              aria-label={`${benefit.label}: redeemed (ticks or clears every step)`}
            />
            <strong>{benefit.label}</strong>
          </label>

          <span className="small">
            {draft.size}/{steps.length} steps
          </span>

          {dirty && (
            <button
              type="button"
              className="button-link"
              onClick={(e) => {
                stopSummaryToggle(e);
                save();
              }}
              disabled={isPending}
            >
              Save
            </button>
          )}
          {isPending && <span className="small">Saving…</span>}
          {outOfSync && (
            <span className="small">
              redemption flag out of sync with steps — saving this benefit will
              sync it
            </span>
          )}
        </summary>

        <div style={{ padding: "0 .75rem .6rem" }}>
          <ul className="list-plain" style={{ marginTop: ".25rem" }}>
            {steps.map((step) => {
              const completedLabel = formatDateGB(
                progress[step.id]?.completedAt ?? null,
              );

              return (
                <li key={step.id} style={{ marginBottom: ".35rem" }}>
                  <label
                    style={{
                      display: "flex",
                      gap: ".5rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={draft.has(step.id)}
                      onChange={(e) => {
                        const next = new Set(draft);
                        if (e.target.checked) next.add(step.id);
                        else next.delete(step.id);
                        setDraft(next);
                      }}
                    />
                    <span>
                      {step.body}
                      {completedLabel && draft.has(step.id) && (
                        <span className="small"> — completed {completedLabel}</span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="small" role="alert" style={{ marginTop: ".25rem" }}>
              {error}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

/** A benefit without steps: redemption stays a plain manual checkbox. */
function SteplessBenefitRow(props: {
  organisationId: number;
  benefit: CatalogueBenefit;
  redeemed: boolean;
}) {
  const { organisationId, benefit, redeemed } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(redeemed);

  const dirty = draft !== redeemed;

  function save() {
    startTransition(async () => {
      try {
        await saveBenefitRedemptionAction({
          organisationId,
          benefitCode: benefit.id,
          redeemed: draft,
        });
        setError(null);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  return (
    <li
      className="tile"
      style={{ padding: ".5rem .75rem", marginBottom: ".5rem" }}
    >
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
          />
          <strong>{benefit.label}</strong>
        </label>

        {dirty && (
          <button
            type="button"
            className="button-link"
            onClick={save}
            disabled={isPending}
          >
            Save
          </button>
        )}
        {isPending && <span className="small">Saving…</span>}
      </div>

      {error && (
        <p className="small" role="alert" style={{ marginTop: ".25rem" }}>
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The combined redemption checklist and step tracker: each in-tier benefit
 * with steps is a dropdown whose summary checkbox means "redeemed", i.e.
 * "every step complete" — one state, no disagreement possible. Saves are per
 * benefit, so a save cannot overwrite a colleague's edit to a different one.
 */
export default function BenefitRedemptionChecklist(props: {
  organisationId: number;
  organisationName: string | null;
  benefits: CatalogueBenefit[];
  memberRank: number | null;
  redeemedCodes: string[];
  progress: BenefitActionProgressMap;
}) {
  const {
    organisationId,
    organisationName,
    benefits,
    memberRank,
    redeemedCodes,
    progress,
  } = props;

  const redeemedSet = new Set(redeemedCodes);

  return (
    <>
      <p className="small" style={{ marginTop: ".25rem" }}>
        Benefits are recorded for{" "}
        <strong>{organisationName ?? "the organisation"}</strong> as a whole,
        not for an individual contact. Ticking a benefit&apos;s checkbox marks
        every process step complete and the benefit redeemed; unticking clears
        the steps and the redemption. Partners see the step progress read-only
        on each benefit&apos;s page.
      </p>

      <ul className="list-plain" style={{ marginTop: ".75rem" }}>
        {benefits.map((b) => {
          const included = hasBenefitAccess(memberRank, b.tierMinRank);

          if (!included) {
            return (
              <li
                key={b.id}
                className="tile"
                style={{ padding: ".5rem .75rem", marginBottom: ".5rem" }}
              >
                <span role="img" aria-label="Locked">
                  🔒
                </span>{" "}
                <strong>{b.label}</strong>
              </li>
            );
          }

          const steps = b.process.actions;

          if (steps.length === 0) {
            return (
              <SteplessBenefitRow
                key={`${b.id}:${redeemedSet.has(b.id) ? 1 : 0}`}
                organisationId={organisationId}
                benefit={b}
                redeemed={redeemedSet.has(b.id)}
              />
            );
          }

          const savedIds = steps
            .filter((s) => progress[s.id])
            .map((s) => s.id)
            .join(",");

          return (
            <SteppedBenefitRow
              key={`${b.id}:${savedIds}:${redeemedSet.has(b.id) ? 1 : 0}`}
              organisationId={organisationId}
              benefit={b}
              progress={progress}
              redeemed={redeemedSet.has(b.id)}
            />
          );
        })}
      </ul>
    </>
  );
}
