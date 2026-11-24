import Link from "next/link";
import { AuthBoundary } from "@/features/auth/auth-screen";
import { currentUser } from "@/features/auth/dal";
import { signOut } from "@/features/auth/actions";
import { invitationPreview } from "@/features/workspaces/dal";
import { roleLabels } from "@/features/workspaces/validation";
import { AcceptInvitationForm } from "@/features/workspaces/forms";
import type { StaffRole } from "@/lib/supabase/database.types";
async function InvitationContent({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invitation = await invitationPreview(token);
  if (!invitation)
    return (
      <>
        <h1>Poziv nije dostupan</h1>
        <p>
          Link je nevažeći, istekao ili opozvan. Zatražite novi poziv od
          vlasnika firme.
        </p>
        <Link href="/account" className="button secondary mt-5">
          Moj nalog
        </Link>
      </>
    );
  const user = await currentUser();
  const next = `/invite/${token}`;
  return (
    <>
      <span className="eyebrow">POZIV U TIM</span>
      <h1>{invitation.workspace_name}</h1>
      <p>Predložena uloga: {roleLabels[invitation.role as StaffRole]}</p>
      <p className="text-sm text-[#60716c]">
        Prihvatanje zahteva potvrđen nalog sa pozvanom email adresom.
      </p>
      {user ? (
        <>
          <p className="mt-5 break-all">Prijavljeni ste kao {user.email}.</p>
          <AcceptInvitationForm token={token} />
          <form action={signOut} data-offline-boundary="discard" className="mt-5">
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="button secondary">
              Promeni nalog
            </button>
          </form>
        </>
      ) : (
        <nav className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            className="button primary"
          >
            Prijavi se za prihvatanje
          </Link>
          <Link
            href={`/sign-up?next=${encodeURIComponent(next)}`}
            className="button secondary"
          >
            Napravi nalog
          </Link>
        </nav>
      )}
    </>
  );
}
export default function InvitationPage(props: PageProps<"/invite/[token]">) {
  return (
    <AuthBoundary>
      <InvitationContent {...props} />
    </AuthBoundary>
  );
}
