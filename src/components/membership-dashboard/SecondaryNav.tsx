// src/components/membership-dashboard/SecondaryNav.tsx
"use client";

import type { CSSProperties } from "react";

export default function SecondaryNav() {
  return (
    <nav
      aria-label="Secondary"
      className="secondary-nav cluster"
      style={{ "--cluster-gap": "0.75rem" } as CSSProperties}
    >
      <button
        type="button"
        className="pill"
        aria-disabled="true"
        disabled
        title="This action will be enabled in a future release."
      >
        Schedule your next client experience check-in
      </button>

      <button
        type="button"
        className="pill"
        aria-disabled="true"
        disabled
        title="This action will be enabled in a future release."
      >
        Send a custom engagement request
      </button>
    </nav>
  );
}
