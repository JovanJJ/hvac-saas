import Link from "next/link";
import { AuthBoundary } from "@/features/auth/auth-screen";
import { onboardingOperation } from "@/features/workspaces/dal";
import { WorkspaceForm } from "@/features/workspaces/forms";
async function OnboardingContent() {
  const operationId = await onboardingOperation();
  return (
    <>
      <span className="eyebrow">DOBRO DOŠLI U TEREN</span>
      <h1>Napravite radni prostor</h1>
      <p className="mb-6 text-sm text-[#60716c]">
        Unesite podatke firme. Možete nastaviti sami ili zatim pozvati tim.
      </p>
      <WorkspaceForm operationId={operationId} />
      <Link href="/account" className="mt-5 block text-sm underline">
        Moj nalog
      </Link>
    </>
  );
}
export default function OnboardingPage() {
  return (
    <AuthBoundary>
      <OnboardingContent />
    </AuthBoundary>
  );
}
