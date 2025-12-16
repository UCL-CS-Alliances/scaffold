// src/components/SignInForm.tsx
"use client";

import { useId, useState } from "react";
import { signIn } from "next-auth/react";

type SignInFormProps = {
  defaultRedirect: string;
};

export default function SignInForm({ defaultRedirect }: SignInFormProps) {
  const helpId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerHelp =
    "Register is currently only available to admins for adding new users.";

  function normalisedEmail(value: string) {
    return value.trim().toLowerCase();
  }

  function goRegisterDenied() {
    window.location.assign("/access-denied?reason=register-admin-only");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const emailNormalised = normalisedEmail(email);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: emailNormalised,
        password,
      });

      if (!res?.ok) {
        setError("Invalid email or password.");
        return;
      }

      window.location.assign(defaultRedirect);
    } catch {
      setError("Something went wrong while signing in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.MouseEvent<HTMLButtonElement>) {
    // Keep this in-form, but ensure it never submits the form
    e.preventDefault();

    setError(null);

    const emailNormalised = normalisedEmail(email);
    const pw = password;

    if (!emailNormalised || !pw) {
      goRegisterDenied();
      return;
    }

    setSubmitting(true);

    try {
      // 1) Check admin status (no session creation)
      const r = await fetch("/api/auth/admin-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailNormalised, password: pw }),
      });

      if (!r.ok) {
        goRegisterDenied();
        return;
      }

      const data = (await r.json()) as { ok: boolean; isAdmin: boolean };

      if (!(data.ok && data.isAdmin)) {
        goRegisterDenied();
        return;
      }

      // 2) Create a real NextAuth session (required for /account/add-user)
      const signInRes = await signIn("credentials", {
        redirect: false,
        email: emailNormalised,
        password: pw,
      });

      if (!signInRes?.ok) {
        goRegisterDenied();
        return;
      }

      // 3) Now authenticated, go to Add user page
      window.location.assign("/account/add-user");
    } catch {
      goRegisterDenied();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <form className="auth-form" onSubmit={handleSignIn}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            className="auth-input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <input
            className="auth-input"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="small">
            {error}
          </p>
        )}

        <div className="auth-actions">
          <button
            type="submit"
            className="button-link button-link--primary"
            disabled={submitting}
          >
            {submitting ? "Working…" : "Sign in"}
          </button>

          <button
            type="button"
            className="auth-linklike"
            aria-disabled="true"
            disabled
          >
            Forgot password?
          </button>

            <button
              type="button"
              className="button-link button-link--secondary"
              onClick={handleRegister}
              disabled={submitting}
              title={registerHelp}
            >
              Register
            </button>
        </div>

        {/* Show the bubble on hover OR focus-within */}
        <style jsx>{`
          .tooltip-bubble {
            display: none;
          }
          .tooltip-wrap:hover .tooltip-bubble,
          .tooltip-wrap:focus-within .tooltip-bubble {
            display: block;
          }
        `}</style>
      </form>
    </section>
  );
}
