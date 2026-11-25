import { AuthBoundary, AuthScreen } from "@/features/auth/auth-screen";
import { safeDestination } from "@/features/auth/validation";
async function SignUpContent({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  return (
    <AuthScreen
      mode="sign-up"
      nextPath={params.next ? safeDestination(params.next) : ""}
    />
  );
}
export default function SignUpPage(props: PageProps<"/sign-up">) {
  return (
    <AuthBoundary>
      <SignUpContent {...props} />
    </AuthBoundary>
  );
}

export const metadata = { title: "Registracija" };
