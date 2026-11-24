import { AuthBoundary, AuthScreen } from "@/features/auth/auth-screen";
import { safeDestination } from "@/features/auth/validation";
async function RecoveryContent({ searchParams }: PageProps<"/forgot-password">) {
  const requested = (await searchParams).next;
  return <AuthScreen mode="forgot-password" nextPath={requested ? safeDestination(requested) : ""} />;
}
export default function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  return (
    <AuthBoundary>
      <RecoveryContent {...props} />
    </AuthBoundary>
  );
}
