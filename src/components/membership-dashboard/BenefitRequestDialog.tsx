// src/components/membership-dashboard/BenefitRequestDialog.tsx
"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { requestBenefitRedemptionAction } from "@/lib/membership-dashboard-actions";

// The action returns its expected failures as typed results; a throw is a
// genuine exception, whose message Next.js masks in production — so keep a
// usable fallback, as BenefitPartnerNotes does.
function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : "The request could not be sent. Please try again.";
}

/**
 * The member-facing "Redeem benefit now" button and its submission form.
 * Submitting registers the organisation's request with the client experience
 * manager — it does not mark the benefit redeemed; "redeemed" still means
 * fully delivered, recorded by the manager.
 */
export default function BenefitRequestDialog(props: {
  benefitCode: string;
  benefitLabel: string;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [note, setNote] = useState("");
  const [preferredTimeframe, setPreferredTimeframe] = useState("");
  const [contactPreference, setContactPreference] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const noteEmpty = note.trim() === "";
  const submitDisabled = isPending || noteEmpty;

  function submit() {
    startTransition(async () => {
      try {
        const result = await requestBenefitRedemptionAction({
          benefitCode: props.benefitCode,
          note,
          preferredTimeframe,
          contactPreference,
        });
        if (result.ok) {
          setError(null);
          setSubmitted(true);
          setIsOpen(false);
          // A save flow at the same URL — the one place router.refresh()
          // belongs — so the page re-renders showing the request.
          router.refresh();
        } else {
          // Keep the modal open and the draft intact: the member can read
          // the reason against what they typed.
          setError(result.message);
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  function close() {
    setIsOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className="button-link button-link--primary"
        onClick={() => setIsOpen(true)}
      >
        Redeem benefit now
      </button>

      {submitted && (
        <p className="small" role="status" style={{ marginTop: "0.5rem" }}>
          Your request has been sent. Your client experience manager will be in
          touch to arrange it.
        </p>
      )}

      <Modal
        title={"Request: " + props.benefitLabel}
        isOpen={isOpen}
        onClose={close}
        initialFocusSelector="[data-autofocus]"
      >
        <p className="small" style={{ marginTop: 0 }}>
          This registers your interest with your client experience manager, who
          will get in touch to arrange it. It does not mark the benefit
          redeemed, and the request is recorded for your whole organisation -
          your colleagues will see it too.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitDisabled) submit();
          }}
        >
          <div className="auth-field">
            <label className="auth-label" htmlFor={`${fieldId}-note`}>
              What would you like? (required)
            </label>
            <textarea
              className="auth-input"
              id={`${fieldId}-note`}
              rows={4}
              data-autofocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor={`${fieldId}-timeframe`}>
              Preferred timeframe (optional)
            </label>
            <input
              className="auth-input"
              id={`${fieldId}-timeframe`}
              type="text"
              value={preferredTimeframe}
              onChange={(e) => setPreferredTimeframe(e.target.value)}
              maxLength={200}
            />
            <p className="small" style={{ margin: "0.25rem 0 0" }}>
              For example, March 2027 or Q2.
            </p>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor={`${fieldId}-contact`}>
              Best contact for this (optional)
            </label>
            <input
              className="auth-input"
              id={`${fieldId}-contact`}
              type="text"
              value={contactPreference}
              onChange={(e) => setContactPreference(e.target.value)}
              maxLength={200}
            />
            <p className="small" style={{ margin: "0.25rem 0 0" }}>
              This will default to you if left blank.
            </p>
          </div>

          {error && (
            <p className="small" role="alert" style={{ marginTop: "0.5rem" }}>
              {error}
            </p>
          )}

          <div className="cluster" style={{ marginTop: "0.75rem" }}>
            <button
              type="submit"
              className="button-link button-link--primary"
              disabled={submitDisabled}
              aria-disabled={submitDisabled ? "true" : undefined}
            >
              Send request
            </button>
            <button
              type="button"
              className="button-link button-link--secondary"
              disabled={isPending}
              onClick={close}
            >
              Cancel
            </button>
            {isPending && <span className="small">Sending…</span>}
          </div>
        </form>
      </Modal>
    </>
  );
}
