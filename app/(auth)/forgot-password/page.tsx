import { AuthBoundary, AuthScreen } from "@/features/auth/auth-screen";
export default function ForgotPasswordPage() {
  return (
    <AuthBoundary>
      <AuthScreen mode="forgot-password" />
    </AuthBoundary>
  );
}
