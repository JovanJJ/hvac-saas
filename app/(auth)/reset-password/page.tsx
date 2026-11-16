import { AuthBoundary, AuthScreen } from "@/features/auth/auth-screen";
import { currentUser } from "@/features/auth/dal";
import { redirect } from "next/navigation";
async function ResetPasswordContent() {
  if (!(await currentUser())) redirect("/sign-in?error=invalid-link");
  return <AuthScreen mode="reset-password" />;
}
export default function ResetPasswordPage() {
  return (
    <AuthBoundary>
      <ResetPasswordContent />
    </AuthBoundary>
  );
}
