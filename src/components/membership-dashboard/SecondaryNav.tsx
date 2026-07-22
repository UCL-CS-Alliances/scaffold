// src/components/membership-dashboard/SecondaryNav.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getSatTeamManager,
  resolveManagerByName,
} from "@/content/contactRouting";

type DefaultsResponse = {
  isAuthenticated: boolean;
  defaultManagerName: string;
};

export default function SecondaryNav() {
  const [loading, setLoading] = useState(true);
  const [defaultManagerName, setDefaultManagerName] = useState<string>(
    "Strategic Alliances Team",
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Reuse the same defaults endpoint used by the contact page.
        const res = await fetch("/api/contact/defaults", { cache: "no-store" });
        const data = (await res.json()) as DefaultsResponse;

        if (cancelled) return;

        if (data?.isAuthenticated && data.defaultManagerName) {
          setDefaultManagerName(data.defaultManagerName);
        } else {
          setDefaultManagerName("Strategic Alliances Team");
        }
      } catch {
        if (!cancelled) setDefaultManagerName("Strategic Alliances Team");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const calendlyUrl = useMemo(() => {
    const manager = resolveManagerByName(defaultManagerName);
    return (manager ?? getSatTeamManager()).calendlyUrl;
  }, [defaultManagerName]);

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
