// src/app/sign-in/page.tsx
import SignInForm from "@/components/SignInForm";

export default function GeneralSignInPage() {
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Sign in to the Alliances Platform</h1>
        <p>
          Use your Alliances account to access membership tools, IXN and Talent
          Discovery, depending on your membership tier.
        </p>
      </header>
      <SignInForm defaultRedirect="/post-sign-in" />
    </section>
  );
}
