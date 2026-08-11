// src/components/membership-dashboard/BenefitProgressTracker.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BenefitActionProgressMap, EditorBenefit } from "@/lib/benefits";
import { hasBenefitAccess } from "@/lib/benefit-access";
import { saveBenefitActionProgressAction } from "@/lib/membership-dashboard-actions";

// Server actions throw on failure; the message is shown as-is in development
// but masked by Next.js in production, so keep a usable fallback.
function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : "The progress could not be saved.";
}

function formatDateGB(d: Date | string | null) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function TrackerCard(props: {
  organisationId: number;
  benefit: EditorBenefit;
  progress: BenefitActionProgressMap;
}) {
  const { organisationId, benefit, progress } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Keyed by the parent on the saved tick-set, so a save or a colleague's
  // change remounts the card fresh rather than resyncing via an effect.
  const [draft, setDraft] = useState<Set<number>>(
    () => new Set(benefit.steps.filter((s) => progress[s.id]).map((s) => s.id)),
  );
  const [error, setError] = useState<string | null>(null);

  const savedCount = benefit.steps.filter((s) => progress[s.id]).length;

  function save() {
    startTransition(async () => {
      try {
        await saveBenefitActionProgressAction({
          organisationId,
          benefitCode: benefit.code,
          completedActionIds: [...draft],
        });
        setError(null);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  return (
    <details
      className="tile"
      style={{ padding: ".5rem .75rem", marginBottom: ".5rem" }}
    >
      <summary>
        <strong>{benefit.label}</strong>{" "}
        <span className="small">
          {savedCount}/{benefit.steps.length} steps complete
        </span>
      </summary>

      <ul className="list-plain" style={{ marginTop: ".5rem" }}>
        {benefit.steps.map((step) => {
          const completedAt = progress[step.id]?.completedAt ?? null;
          const completedLabel = formatDateGB(completedAt);

          return (
            <li key={step.id} style={{ marginBottom: ".4rem" }}>
              <label
                style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}
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

      <div className="cluster" style={{ marginTop: ".5rem" }}>
        <button
          type="button"
          className="button-link"
          onClick={save}
          disabled={isPending}
          aria-disabled={isPending ? "true" : undefined}
        >
          Save progress
        </button>
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
 * Admin tracker for a partner's progress through each benefit's process
 * (phase E): admin ticks, members see the same state read-only on the benefit
 * detail page. Saving is per benefit, whole tick-set at once, so the audit
 * trail records added/removed rather than one row per click. Ticks never
 * touch redemption — marking a benefit redeemed stays a separate, deliberate
 * act on the checklist above.
 */
export default function BenefitProgressTracker(props: {
  organisationId: number;
  benefits: EditorBenefit[];
  progress: BenefitActionProgressMap;
  memberRank: number | null;
}) {
  const { organisationId, benefits, progress, memberRank } = props;

  // Active benefits with steps that this partner's tier includes. Progress on
  // a benefit the partner cannot use has no member-facing surface, so it is
  // not trackable here.
  const trackable = benefits.filter(
    (b) =>
      b.isActive &&
      b.steps.length > 0 &&
      hasBenefitAccess(memberRank, b.tierMinRank),
  );

  if (trackable.length === 0) {
    return (
      <div>
        <h4 style={{ marginBottom: ".5rem" }}>Benefit progress tracker</h4>
        <p className="small">
          No benefits with process steps are available at this partner&apos;s
          tier.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h4 style={{ marginBottom: ".5rem" }}>Benefit progress tracker</h4>

      <p className="small" style={{ margin: "0 0 .75rem" }}>
        Tick the steps completed with this partner. Every contact there sees
        the same progress, read-only, on the benefit&apos;s page. Ticking every
        step does <strong>not</strong> mark the benefit redeemed — that stays a
        separate decision on the checklist above.
      </p>

      {trackable.map((b) => {
        const savedIds = b.steps
          .filter((s) => progress[s.id])
          .map((s) => s.id)
          .join(",");

        return (
          <TrackerCard
            key={`${b.benefitId}:${savedIds}`}
            organisationId={organisationId}
            benefit={b}
            progress={progress}
          />
        );
      })}
    </div>
  );
}
