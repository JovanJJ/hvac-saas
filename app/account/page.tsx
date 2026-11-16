import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { accountWorkspaces, requireUser } from "@/features/auth/dal";
import { signOut } from "@/features/auth/actions";
import { AuthLoading } from "@/features/auth/auth-screen";
import { beginOnboarding } from "@/features/workspaces/actions";
import { WorkspaceSwitcher } from "@/features/workspaces/forms";
import { roleLabels } from "@/features/workspaces/validation";
async function AccountContent() {
  const user = await requireUser();
  const workspaces = await accountWorkspaces();
  return (
    <>
      <span className="eyebrow">TEREN · NALOG</span>
      <h1>Vaš radni prostor</h1>
      <p className="break-all text-[#60716c]">
        Prijavljeni ste kao {user.email}. Email adresa je potvrđena.
      </p>
      <h2 className="mt-8 mb-4 text-lg">Vaši timovi</h2>
      {workspaces.length ? (
        <>
          <ul className="grid list-none gap-4 p-0">
            {workspaces.map(({ organization, role }) => (
              <li key={organization.id} className="card">
                <h3>{organization.display_name}</h3>
                <p>
                  {roleLabels[role]} · {organization.time_zone}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <WorkspaceSwitcher workspaces={workspaces} />
          </div>
        </>
      ) : (
        <div className="card">
          <h3>Još nemate radni prostor</h3>
          <p>
            Napravite prostor svoje firme ili otvorite poziv koji ste dobili.
          </p>
          <Link href="/onboarding" className="button primary mt-4">
            Napravi radni prostor
          </Link>
        </div>
      )}
      <form action={beginOnboarding} className="mt-6">
        <input type="hidden" name="operationId" value={randomUUID()} />
        <button className="button secondary" type="submit">
          Novi radni prostor
        </button>
      </form>
      <form action={signOut} className="mt-5">
        <button className="button secondary" type="submit">
          Odjavi se
        </button>
      </form>
    </>
  );
}
export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Suspense fallback={<AuthLoading />}>
        <AccountContent />
      </Suspense>
    </main>
  );
}
