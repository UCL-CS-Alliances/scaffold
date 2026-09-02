// src/app/reset-password/page.tsx

import { Suspense } from "react";
import ResetUserPassword from "@/components/account/ResetUserPassword";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <section className="content-section">
          <header className="content-header">
            <h1>Reset password</h1>
            <p>Loading…</p>
          </header>
        </section>
      }
    >
      <ResetUserPassword defaultRedirect="/sign-in" />
    </Suspense>
  );
}