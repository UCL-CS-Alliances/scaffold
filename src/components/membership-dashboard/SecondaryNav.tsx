// src/components/membership-dashboard/SecondaryNav.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { getSatTeamManager } from "@/content/contactRouting";

type DefaultsResponse = {
  isAuthenticated: boolean;
  defaultManagerCalendlyUrl: string;
};

export default function SecondaryNav() {
  const [loading, setLoading] = useState(true);
  const [calendlyUrl, setCalendlyUrl] = useState<string>(
    getSatTeamManager().calendlyUrl,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Reuse the same defaults endpoint used by the contact page; it
        // resolves the organisation's assigned manager server-side.
        const res = await fetch("/api/contact/defaults", { cache: "no-store" });
        const data = (await res.json()) as DefaultsResponse;

        if (cancelled) return;

        setCalendlyUrl(
          data?.defaultManagerCalendlyUrl || getSatTeamManager().calendlyUrl,
        );
      } catch {
        if (!cancelled) setCalendlyUrl(getSatTeamManager().calendlyUrl);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav
      aria-label="Secondary"
      className="secondary-nav cluster"
      style={{ "--cluster-gap": "0.75rem" } as CSSProperties}
    >
      <a
        className="pill"
        href={calendlyUrl}
        target="_blank"
        rel="noreferrer"
        aria-disabled={loading ? "true" : undefined}
        style={
          loading
            ? ({ pointerEvents: "none", opacity: 0.6 } as CSSProperties)
            : undefined
        }
        title={
          loading
            ? "Loading your client experience manager…"
            : "Open Calendly in a new tab."
        }
      >
        Schedule client experience check-in
      </a>

      <button
        type="button"
        className="pill"
        aria-disabled="true"
        disabled
        title="This action will be enabled in a future release."
      >
        Customise benefits
      </button>

      <button
        type="button"
        className="pill"
        aria-disabled="true"
        disabled
        title="This action will be enabled in a future release."
      >
        Download invoice
      </button>

      <button
        type="button"
        className="pill"
        aria-disabled="true"
        disabled
        title="This action will be enabled in a future release."
      >
        View framework agreement
      </button>
    </nav>
  );
}
