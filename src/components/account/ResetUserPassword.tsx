// src/components/account/ResetUserPassword.tsx

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ResetPasswordProps = {
  defaultRedirect?: string;
};

export default function ResetUserPassword({ defaultRedirect = "/sign-in" }: ResetPasswordProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenFromUrl = searchParams.get("token") ?? "";
  const emailFromUrl = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasToken = Boolean(tokenFromUrl);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not send reset email.");
        return;
      }

      setStatus("A reset link has been sent.");
      setEmail("");
    } catch {
      setError("Could not send reset email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!tokenFromUrl || !emailFromUrl) {
      setError("This reset link is missing required information.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailFromUrl,
          token: tokenFromUrl,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not reset password.");
        return;
      }

      setStatus("Your password has been reset. Redirecting to sign in...");
      setPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.push(defaultRedirect);
      }, 1500);
    } catch {
      setError("Could not reset password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Reset password</h1>
        <p>
          {hasToken
            ? "Choose a new password for your account."
            : "Enter your email to receive a reset link."}
        </p>
      </header>

      <div className="auth-card" style={{ maxWidth: 560 }}>
        {!hasToken ? (
          <form className="auth-form" onSubmit={requestReset}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {status && <p role="status" className="small">{status}</p>}
            {error && <p role="alert" className="small">{error}</p>}

            <div className="auth-actions">
              <button type="submit" className="button-link button-link--primary" disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitNewPassword}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {status && <p role="status" className="small">{status}</p>}
            {error && <p role="alert" className="small">{error}</p>}

            <div className="auth-actions">
              <button type="submit" className="button-link button-link--primary" disabled={submitting}>
                {submitting ? "Updating…" : "Set new password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

