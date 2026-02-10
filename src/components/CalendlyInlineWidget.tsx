// src/components/CalendlyInlineWidget.tsx
"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void;
    };
  }
}

let calendlyScriptPromise: Promise<void> | null = null;

function loadCalendlyScript(): Promise<void> {
  if (calendlyScriptPromise) return calendlyScriptPromise;

  calendlyScriptPromise = new Promise((resolve, reject) => {
    // If already loaded, resolve immediately.
    if (typeof window !== "undefined" && window.Calendly?.initInlineWidget) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://assets.calendly.com/assets/external/widget.js"]',
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject());
      return;
    }

    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.body.appendChild(script);
  });

  return calendlyScriptPromise;
}

export default function CalendlyInlineWidget({
  url,
  height = 700,
  minWidth = 320,
}: {
  url: string;
  height?: number;
  minWidth?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;

      await loadCalendlyScript();
      if (cancelled) return;

      // Clear previous widget before re-initialising on URL change
      containerRef.current.innerHTML = "";

      if (window.Calendly?.initInlineWidget) {
        window.Calendly.initInlineWidget({
          url,
          parentElement: containerRef.current,
        });
      }
    }

    init().catch(() => {
      // Fail silently; page still usable.
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      ref={containerRef}
      style={{ minWidth: `${minWidth}px`, height: `${height}px` }}
    />
  );
}
