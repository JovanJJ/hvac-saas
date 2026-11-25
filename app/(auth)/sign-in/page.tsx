import { safeDestination } from "@/features/auth/validation";
import { AuthBoundary, AuthScreen } from "@/features/auth/auth-screen";

async function SignInContent({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const notice =
    params.message === "password-updated" ? (
      <p role="status" className="mb-5 rounded-md bg-[#e7f1e5] p-3 text-sm">
        Lozinka je promenjena. Prijavite se novom lozinkom.
      </p>
    ) : params.error === "invalid-link" ? (
      <p role="alert" className="mb-5 rounded-md bg-[#fff0eb] p-3 text-sm">
        Link nije važeći ili je istekao. Zatražite novi link za oporavak ili se
        prijavite.
      </p>
    ) : undefined;
  return (
    <AuthScreen
      mode="sign-in"
      notice={notice}
      nextPath={params.next ? safeDestination(params.next) : ""}
    />
  );
}
export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <AuthBoundary>
      <SignInContent {...props} />
    </AuthBoundary>
  );
}

export const metadata = { title: "Prijava" };
