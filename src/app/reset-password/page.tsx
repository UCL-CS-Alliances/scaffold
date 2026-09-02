// src/app/reset-password/page.tsx

import ResetUserPassword from "@/components/account/ResetUserPassword";

export default function ResetPasswordPage() {
  return <ResetUserPassword defaultRedirect="/sign-in" />;
}