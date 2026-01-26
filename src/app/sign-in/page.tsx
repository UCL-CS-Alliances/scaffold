// src/app/sign-in/page.tsx
import SignInForm from "@/components/SignInForm";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";

export default async function GeneralSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callback_url?: string }>;
}) {
  const params = await searchParams;
  const callback_url = params.callback_url || "/post-sign-in";

  // Check if user is already signed in
  const session = await getServerAuthSession();
  if (session?.user) {
    // Already signed in - redirect to callback URL
    redirect(callback_url);
  }

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Sign in to the Alliances Platform</h1>
        <p>
          Use your Alliances account to access membership tools, IXN and Talent
          Discovery, depending on your membership tier.
        </p>
      </header>
      <SignInForm defaultRedirect={callback_url} />
    </section>
  );
}
