// src/app/contact/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CalendlyInlineWidget from "@/components/CalendlyInlineWidget";
import {
  enquiryTopics,
  getSatTeamManager,
  SAT_MANAGER_ID,
} from "@/content/contactRouting";
import type { ContactManagerOption } from "@/lib/contact-managers";

type DefaultsResponse = {
  isAuthenticated: boolean;
  name: string;
  email: string;
  organisation: string;
  // Admin users plus the Strategic Alliances Team entry, resolved server-side.
  managers: ContactManagerOption[];
  defaultManagerId: string;
  defaultManagerCalendlyUrl: string;
};

type SubmitResponse =
  | { ok: true; ticketId: string; managerName: string; etherealPreviewUrl: string | null }
  | { ok: false; error: string };

export default function ContactPage() {
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [defaults, setDefaults] = useState<DefaultsResponse>(() => {
    const sat = getSatTeamManager();
    return {
      isAuthenticated: false,
      name: "",
      email: "",
      organisation: "",
      // SAT entry as a standing option so the select renders something even
      // if the defaults fetch fails.
      managers: [
        { id: SAT_MANAGER_ID, name: sat.name, calendlyUrl: sat.calendlyUrl },
      ],
      defaultManagerId: SAT_MANAGER_ID,
      defaultManagerCalendlyUrl: sat.calendlyUrl,
    };
  });

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [managerId, setManagerId] = useState(SAT_MANAGER_ID);
  const [topicLabel, setTopicLabel] = useState("General Enquiry");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Anti-bot
  const [humanCheckAnswer, setHumanCheckAnswer] = useState("");
  const [honeypotWebsite, setHoneypotWebsite] = useState(""); // should remain empty

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [etherealPreviewUrl, setEtherealPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadDefaults() {
      setLoadingDefaults(true);
      try {
        const res = await fetch("/api/contact/defaults", { cache: "no-store" });
        const data = (await res.json()) as DefaultsResponse;

        setDefaults(data);

        // Prefill
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        setOrganisation(data.organisation ?? "");
        setManagerId(data.defaultManagerId || SAT_MANAGER_ID);
      } catch {
        // Keep defaults; page remains usable for unauth.
      } finally {
        setLoadingDefaults(false);
      }
    }

    loadDefaults();
  }, []);

  const calendlyUrl = useMemo(() => {
    if (!defaults.isAuthenticated) return getSatTeamManager().calendlyUrl;
    const selected = defaults.managers.find((m) => m.id === managerId);
    return selected?.calendlyUrl ?? defaults.defaultManagerCalendlyUrl;
  }, [defaults, managerId]);

  const canSend =
    !submitting &&
    name.trim() &&
    email.trim() &&
    organisation.trim() &&
    topicLabel.trim() &&
    subject.trim() &&
    message.trim() &&
    humanCheckAnswer.trim() === "24" &&
    honeypotWebsite.trim() === "";

  function validateClient(): string | null {
    if (!name.trim()) return "Please enter your name.";
    if (!email.trim()) return "Please enter your email address.";
    if (!organisation.trim()) return "Please enter your organisation.";
    if (!topicLabel.trim()) return "Please choose a topic.";
    if (!subject.trim()) return "Please enter a subject.";
    if (!message.trim()) return "Please enter a message.";
    if (honeypotWebsite.trim()) return "Unable to submit enquiry.";
    if (humanCheckAnswer.trim() !== "24")
      return "Verification failed. Please answer the human check question correctly.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setEtherealPreviewUrl(null);

    const v = validateClient();
    if (v) {
      setErrorMsg(v);
      return;
    }

    setSubmitting(true);

    try {
      const effectiveManagerId = defaults.isAuthenticated
        ? managerId
        : SAT_MANAGER_ID;

      const res = await fetch("/api/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          organisation,
          managerId: effectiveManagerId,
          topicLabel,
          subject,
          message,
          humanCheckAnswer,
          website: honeypotWebsite,
        }),
      });

      const data = (await res.json()) as SubmitResponse;

      if (!data.ok) {
        setErrorMsg(data.error || "Unable to send enquiry.");
        return;
      }

      setEtherealPreviewUrl(data.etherealPreviewUrl);
      setStatusMsg(
        `Thank you — your enquiry has been submitted. Your reference is ${data.ticketId}.`,
      );

      setSubject("");
      setMessage("");
      setHumanCheckAnswer("");
      setHoneypotWebsite("");
    } catch {
      setErrorMsg("Unable to send enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Contact us</h1>
        <p>
          You can get in touch with the Alliances team in several ways. Use the enquiry form below for written questions, or schedule
          a call for client experience check-ins, discussions related to Industry Exchange Network (IXN)
          projects, and any other general conversations.
        </p>
      </header>

      <section className="content-subsection">
        <h2>Enquiries</h2>

        <div aria-live="polite" style={{ marginTop: "0.75rem" }}>
          {statusMsg && (
            <p>
              <strong>{statusMsg}</strong>
            </p>
          )}
          {errorMsg && (
            <p>
              <strong>Error:</strong> {errorMsg}
            </p>
          )}
          {etherealPreviewUrl && (
            <p>
              <strong>Developer preview:</strong>{" "}
              <a href={etherealPreviewUrl} target="_blank" rel="noreferrer">
                Open Ethereal email preview
              </a>
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: "720px" }}>
            <label>
              <div>Name</div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              <div>E-mail</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              <div>Organisation</div>
              <input
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                autoComplete="organization"
                style={{ width: "100%" }}
                required
              />
            </label>

            <label>
              <div>Client experience manager</div>
              <select
                value={defaults.isAuthenticated ? managerId : SAT_MANAGER_ID}
                onChange={(e) => setManagerId(e.target.value)}
                disabled={!defaults.isAuthenticated}
                aria-disabled={!defaults.isAuthenticated}
                style={{ width: "100%" }}
              >
                {defaults.managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {!defaults.isAuthenticated && (
                <p style={{ marginTop: "0.25rem" }}>
                  Sign in to contact a specific client experience manager.
                </p>
              )}
            </label>

            <label>
              <div>Topic of enquiry</div>
              <select
                value={topicLabel}
                onChange={(e) => setTopicLabel(e.target.value)}
                style={{ width: "100%" }}
              >
                {enquiryTopics.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div>Subject of enquiry</div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>

            <label>
              <div>Message</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                style={{ width: "100%" }}
              />
            </label>

            {/* Honeypot field: keep out of the accessibility tree and off-screen */}
            <div style={{ position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }} aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypotWebsite}
                  onChange={(e) => setHoneypotWebsite(e.target.value)}
                />
              </label>
            </div>

            <label>
              <div>Are you a human?</div>
              <p style={{ marginTop: "0.25rem" }}>
               What's the number of sides of a triangle, multiplied by 8?
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={humanCheckAnswer}
                onChange={(e) => setHumanCheckAnswer(e.target.value)}
                style={{ width: "100%" }}
              />
              <p id="human-check-hint" style={{ marginTop: "0.25rem" }}>
                Enter the correct answer<strong>as a number</strong> to enable sending.
              </p>
            </label>

            <button type="submit" disabled={!canSend} aria-disabled={!canSend}>
              {submitting ? "Sending..." : "Send"}
            </button>

            {loadingDefaults && <p style={{ marginTop: "0.5rem" }}>Loading your details…</p>}
          </div>
        </form>
      </section>

      <section className="content-subsection">
        <h2>Schedule a call</h2>
        <p>
         Do you prefer to arrange a meeting? Registered users can schedule calls directly with a member of the Alliances team. Paying members of our Friends of Computer Science programme can also schedule client experience check-ins here, directly with their dedicated client experience manager.
        </p>

        {!defaults.isAuthenticated ? (
          <div style={{ marginTop: "1rem" }}>
            <p>Please sign in to schedule a call.</p>
            <Link href="/sign-in">
              <button type="button">Sign in</button>
            </Link>
          </div>
        ) : (
          <div style={{ marginTop: "1rem" }}>
            <CalendlyInlineWidget url={calendlyUrl} height={700} />
          </div>
        )}
      </section>
    </section>
  );
}
