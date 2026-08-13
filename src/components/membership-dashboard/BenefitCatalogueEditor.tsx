// src/components/membership-dashboard/BenefitCatalogueEditor.tsx
"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { EditorBenefit } from "@/lib/benefits";
import type { MembershipTierOption } from "@/lib/membership-dashboard-admin";
import {
  addBenefitStepAction,
  createCatalogueBenefitAction,
  deleteBenefitStepAction,
  reorderBenefitStepsAction,
  restoreCatalogueBenefitAction,
  retireCatalogueBenefitAction,
  updateBenefitStepAction,
  updateCatalogueBenefitAction,
  type CatalogueBenefitInput,
} from "@/lib/benefit-catalogue-actions";

// The editable fields as form state; terms are edited as one-per-line text
// and split on save.
type BenefitDraft = {
  label: string;
  category: string;
  description: string;
  trigger: string;
  outcome: string;
  termsText: string;
  tierMinId: string;
  supersedesCodes: string[];
};

function draftFromBenefit(b: EditorBenefit): BenefitDraft {
  return {
    label: b.label,
    category: b.category,
    description: b.description,
    trigger: b.trigger ?? "",
    outcome: b.outcome ?? "",
    termsText: b.terms.join("\n"),
    tierMinId: String(b.tierMinId),
    supersedesCodes: b.supersedesCodes,
  };
}

function emptyDraft(tierOptions: MembershipTierOption[]): BenefitDraft {
  return {
    label: "",
    category: "",
    description: "",
    trigger: "",
    outcome: "",
    termsText: "",
    tierMinId: String(tierOptions[0]?.id ?? ""),
    supersedesCodes: [],
  };
}

function draftToInput(draft: BenefitDraft): CatalogueBenefitInput {
  return {
    label: draft.label,
    category: draft.category,
    description: draft.description,
    trigger: draft.trigger || null,
    outcome: draft.outcome || null,
    terms: draft.termsText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
    tierMinId: Number(draft.tierMinId),
    supersedesCodes: draft.supersedesCodes,
  };
}

// Server actions throw on validation failure; the message is shown as-is in
// development but masked by Next.js in production, so keep a usable fallback.
function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : "The change could not be saved.";
}

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginTop: ".75rem",
  marginBottom: ".25rem",
};

// Shared field markup for the create and edit forms. Supersede entries are
// picked from the existing benefits, never typed (decision 3 depends on it).
function BenefitFields(props: {
  idPrefix: string;
  draft: BenefitDraft;
  setDraft: (next: BenefitDraft) => void;
  tierOptions: MembershipTierOption[];
  supersedeOptions: { code: string; label: string; isActive: boolean }[];
}) {
  const { idPrefix, draft, setDraft, tierOptions, supersedeOptions } = props;

  return (
    <>
      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-label`}>
        Label
      </label>
      <input
        id={`${idPrefix}-label`}
        className="auth-input"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-category`}>
        Category
      </label>
      <input
        id={`${idPrefix}-category`}
        className="auth-input"
        value={draft.category}
        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
      />

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-description`}>
        Description
      </label>
      <textarea
        id={`${idPrefix}-description`}
        className="auth-input"
        rows={3}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-tier`}>
        Minimum tier
      </label>
      <select
        id={`${idPrefix}-tier`}
        className="auth-input"
        value={draft.tierMinId}
        onChange={(e) => setDraft({ ...draft, tierMinId: e.target.value })}
        style={{ width: "min(16rem, 100%)" }}
      >
        {tierOptions.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.label}
          </option>
        ))}
      </select>

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-trigger`}>
        Process trigger <span className="small">(optional)</span>
      </label>
      <input
        id={`${idPrefix}-trigger`}
        className="auth-input"
        value={draft.trigger}
        onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
      />

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-outcome`}>
        Process outcome <span className="small">(optional)</span>
      </label>
      <input
        id={`${idPrefix}-outcome`}
        className="auth-input"
        value={draft.outcome}
        onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
      />

      <label style={fieldLabelStyle} htmlFor={`${idPrefix}-terms`}>
        Terms <span className="small">(one per line)</span>
      </label>
      <textarea
        id={`${idPrefix}-terms`}
        className="auth-input"
        rows={4}
        value={draft.termsText}
        onChange={(e) => setDraft({ ...draft, termsText: e.target.value })}
      />

      {supersedeOptions.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={fieldLabelStyle}>Supersedes</legend>
          <p className="small" style={{ margin: "0 0 .25rem" }}>
            Benefits this one replaces for members who qualify for both.
          </p>
          {supersedeOptions.map((opt) => (
            <label
              key={opt.code}
              style={{ display: "flex", gap: ".5rem", alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={draft.supersedesCodes.includes(opt.code)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...draft.supersedesCodes, opt.code]
                    : draft.supersedesCodes.filter((c) => c !== opt.code);
                  setDraft({ ...draft, supersedesCodes: next });
                }}
              />
              <span>
                {opt.code} — {opt.label}
                {!opt.isActive && " (retired)"}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function CreateBenefitCard(props: {
  tierOptions: MembershipTierOption[];
  supersedeOptions: { code: string; label: string; isActive: boolean }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => emptyDraft(props.tierOptions));
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      try {
        const created = await createCatalogueBenefitAction(draftToInput(draft));
        setCreatedCode(created.code);
        setError(null);
        setDraft(emptyDraft(props.tierOptions));
        router.refresh();
      } catch (e) {
        setCreatedCode(null);
        setError(errorMessage(e));
      }
    });
  }

  return (
    <details className="tile" style={{ padding: ".75rem", marginBottom: ".75rem" }}>
      <summary>
        <strong>Create a new benefit</strong>
      </summary>

      <p className="small" style={{ marginTop: ".5rem" }}>
        The benefit code is assigned automatically and never changes. Process
        steps are added after the benefit is created, from its card below.
      </p>

      <BenefitFields
        idPrefix="create-benefit"
        draft={draft}
        setDraft={setDraft}
        tierOptions={props.tierOptions}
        supersedeOptions={props.supersedeOptions}
      />

      <div className="cluster" style={{ marginTop: ".75rem" }}>
        <button
          type="button"
          className="button-link"
          onClick={create}
          disabled={isPending}
          aria-disabled={isPending ? "true" : undefined}
        >
          Create benefit
        </button>
        {isPending && <span className="small">Saving…</span>}
      </div>

      {createdCode && (
        <p className="small" role="status" style={{ marginTop: ".5rem" }}>
          Created benefit {createdCode}.
        </p>
      )}
      {error && (
        <p className="small" role="alert" style={{ marginTop: ".5rem" }}>
          {error}
        </p>
      )}
    </details>
  );
}

function StepEditorRow(props: {
  step: { id: number; body: string };
  /** Partners with recorded progress on this step — their progress rows
   * cascade away with the step, so the confirm dialog states the number. */
  progressPartnerCount: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (stepId: number, delta: -1 | 1) => void;
  run: (fn: () => Promise<unknown>) => void;
  isPending: boolean;
}) {
  const { step, progressPartnerCount, isFirst, isLast, onMove, run, isPending } =
    props;
  // No resync effect: the row is keyed on the step's server body, so a change
  // that round-trips (a save, or a colleague's edit) remounts it fresh.
  const [body, setBody] = useState(step.body);

  function remove() {
    // Deleting a step cascades every partner's recorded progress on it — the
    // confirm must say so, and say how many partners that touches.
    const progressWarning =
      progressPartnerCount === 0
        ? "No partner has recorded progress on this step yet."
        : `${progressPartnerCount} partner${
            progressPartnerCount === 1 ? " has" : "s have"
          } recorded progress on this step, which will be permanently deleted with it.`;

    const confirmed = window.confirm(
      `Delete this step? Members will no longer see it. ${progressWarning} ` +
        "This cannot be undone.",
    );
    if (!confirmed) return;
    run(() => deleteBenefitStepAction({ benefitActionId: step.id }));
  }

  return (
    <li style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".4rem" }}>
      <input
        className="auth-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Step text"
        style={{ flex: 1 }}
      />
      {body.trim() !== step.body && (
        <button
          type="button"
          className="button-link button-link--secondary"
          disabled={isPending}
          onClick={() =>
            run(() => updateBenefitStepAction({ benefitActionId: step.id, body }))
          }
        >
          Save
        </button>
      )}
      <button
        type="button"
        className="button-link button-link--secondary"
        disabled={isPending || isFirst}
        aria-label="Move step up"
        onClick={() => onMove(step.id, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="button-link button-link--secondary"
        disabled={isPending || isLast}
        aria-label="Move step down"
        onClick={() => onMove(step.id, 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="button-link button-link--secondary"
        disabled={isPending}
        onClick={remove}
      >
        Delete
      </button>
    </li>
  );
}

function BenefitEditorCard(props: {
  benefit: EditorBenefit;
  tierOptions: MembershipTierOption[];
  supersedeOptions: { code: string; label: string; isActive: boolean }[];
  stepProgressCounts: Record<number, number>;
}) {
  const { benefit, tierOptions, stepProgressCounts } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => draftFromBenefit(benefit));
  const [newStep, setNewStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Server state is the source of truth after every refresh; unsaved field
  // edits are deliberately reset when the benefit re-arrives changed.
  useEffect(() => {
    setDraft(draftFromBenefit(benefit));
  }, [benefit]);

  // A benefit cannot supersede itself; the action re-checks this server-side.
  const supersedeOptions = props.supersedeOptions.filter(
    (o) => o.code !== benefit.code,
  );

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        setError(null);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  function moveStep(stepId: number, delta: -1 | 1) {
    const ids = benefit.steps.map((s) => s.id);
    const from = ids.indexOf(stepId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    run(() =>
      reorderBenefitStepsAction({
        benefitId: benefit.benefitId,
        orderedStepIds: ids,
      }),
    );
  }

  function retire() {
    const confirmed = window.confirm(
      "Retire this benefit? It disappears from member views immediately. " +
        "Redemption history is kept, and the benefit can be restored later.",
    );
    if (!confirmed) return;
    run(() => retireCatalogueBenefitAction({ benefitId: benefit.benefitId }));
  }

  return (
    <details
      className="tile"
      style={{ padding: ".75rem", marginBottom: ".75rem" }}
    >
      <summary>
        <strong>
          {benefit.code} — {benefit.label}
        </strong>{" "}
        {!benefit.isActive && <span className="pill">Retired</span>}
      </summary>

      <div className="cluster" style={{ marginTop: ".5rem" }}>
        {benefit.isActive ? (
          <button
            type="button"
            className="button-link button-link--secondary"
            onClick={retire}
            disabled={isPending}
          >
            Retire benefit
          </button>
        ) : (
          <button
            type="button"
            className="button-link button-link--secondary"
            onClick={() =>
              run(() =>
                restoreCatalogueBenefitAction({ benefitId: benefit.benefitId }),
              )
            }
            disabled={isPending}
          >
            Restore benefit
          </button>
        )}
        {isPending && <span className="small">Saving…</span>}
      </div>

      <BenefitFields
        idPrefix={`benefit-${benefit.benefitId}`}
        draft={draft}
        setDraft={setDraft}
        tierOptions={tierOptions}
        supersedeOptions={supersedeOptions}
      />

      <div className="cluster" style={{ marginTop: ".75rem" }}>
        <button
          type="button"
          className="button-link"
          disabled={isPending}
          onClick={() =>
            run(() =>
              updateCatalogueBenefitAction({
                benefitId: benefit.benefitId,
                benefit: draftToInput(draft),
              }),
            )
          }
        >
          Save changes
        </button>
      </div>

      <h4 style={{ marginBottom: ".25rem" }}>Process steps</h4>
      <p className="small" style={{ margin: "0 0 .5rem" }}>
        Reordering keeps each step&apos;s identity, so recorded partner
        progress stays attached to the right step. Deleting a step deletes its
        progress too.
      </p>

      {benefit.steps.length === 0 ? (
        <p className="small">No steps yet.</p>
      ) : (
        <ul className="list-plain">
          {benefit.steps.map((step, index) => (
            <StepEditorRow
              key={`${step.id}:${step.body}`}
              step={step}
              progressPartnerCount={stepProgressCounts[step.id] ?? 0}
              isFirst={index === 0}
              isLast={index === benefit.steps.length - 1}
              onMove={moveStep}
              run={run}
              isPending={isPending}
            />
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginTop: ".5rem" }}>
        <input
          className="auth-input"
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          placeholder="New step text"
          aria-label="New step text"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="button-link button-link--secondary"
          disabled={isPending || !newStep.trim()}
          onClick={() =>
            run(async () => {
              await addBenefitStepAction({
                benefitId: benefit.benefitId,
                body: newStep,
              });
              setNewStep("");
            })
          }
        >
          Add step
        </button>
      </div>

      {error && (
        <p className="small" role="alert" style={{ marginTop: ".5rem" }}>
          {error}
        </p>
      )}
    </details>
  );
}

export default function BenefitCatalogueEditor(props: {
  benefits: EditorBenefit[];
  tierOptions: MembershipTierOption[];
  stepProgressCounts: Record<number, number>;
}) {
  const { benefits, tierOptions, stepProgressCounts } = props;

  const supersedeOptions = benefits.map((b) => ({
    code: b.code,
    label: b.label,
    isActive: b.isActive,
  }));

  return (
    <>
      <p className="small" style={{ marginTop: ".25rem" }}>
        Changes here are live for members immediately — no deploy. This
        catalogue is the authoritative copy; the Handbook chapters restate it
        and are <strong>not</strong> updated automatically, so treat them as a
        snapshot until they are reconciled.
      </p>

      <CreateBenefitCard
        tierOptions={tierOptions}
        supersedeOptions={supersedeOptions}
      />

      {benefits.map((b) => (
        <BenefitEditorCard
          key={b.benefitId}
          benefit={b}
          tierOptions={tierOptions}
          supersedeOptions={supersedeOptions}
          stepProgressCounts={stepProgressCounts}
        />
      ))}
    </>
  );
}
