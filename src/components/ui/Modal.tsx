// src/components/ui/Modal.tsx
"use client";

import { useEffect, useId, useMemo, useRef } from "react";

type Props = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  initialFocusSelector?: string; // e.g. "[data-autofocus]"
  children: React.ReactNode;
};

function getFocusable(container: HTMLElement) {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(",")))
    .filter((el) => !el.hasAttribute("aria-hidden") && !el.hidden);
}

export default function Modal({
  title,
  description,
  isOpen,
  onClose,
  initialFocusSelector,
  children,
}: Props) {
  const titleId = useId();
  const descId = useId();

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const labelledBy = useMemo(() => titleId, [titleId]);
  const describedBy = useMemo(() => (description ? descId : undefined), [descId, description]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;

    // Focus management
    const panel = panelRef.current;
    if (panel) {
      const preferred =
        initialFocusSelector ? panel.querySelector<HTMLElement>(initialFocusSelector) : null;

      const focusables = getFocusable(panel);
      const toFocus = preferred ?? focusables[0] ?? panel;
      toFocus.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const panelNow = panelRef.current;
        if (!panelNow) return;

        const focusables = getFocusable(panelNow);
        if (!focusables.length) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);

    // Prevent background scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;

      // Restore focus to the triggering element
      previousActive?.focus?.();
    };
  }, [isOpen, onClose, initialFocusSelector]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 2000,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className="tile"
        style={{
          width: "min(44rem, 100%)",
          padding: "1rem",
          background: "var(--card)",
        }}
      >
        <div className="cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 id={titleId} style={{ margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="button-link" onClick={onClose}>
            Close
          </button>
        </div>

        {description && (
          <p id={descId} className="small" style={{ marginTop: "0.5rem" }}>
            {description}
          </p>
        )}

        <div style={{ marginTop: "0.75rem" }}>{children}</div>
      </div>
    </div>
  );
}
