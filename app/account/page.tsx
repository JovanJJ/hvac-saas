import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { accountWorkspaces, requireUser } from "@/features/auth/dal";
import { signOut } from "@/features/auth/actions";
import { AuthLoading } from "@/features/auth/auth-screen";
import { beginOnboarding } from "@/features/workspaces/actions";
import { WorkspaceChoice } from "@/features/workspaces/workspace-choice";
import { safeDestination } from "@/features/auth/validation";
import { AuthShell } from "@/features/auth/auth-screen";
import { selectedWorkspace } from "@/features/workspaces/dal";
import { roleLabels } from "@/features/workspaces/validation";
async function AccountContent({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const workspaces = await accountWorkspaces();
  const { workspace } = await selectedWorkspace();
  const requested = (await searchParams).next;
  const next = requested ? safeDestination(requested) : "";
  return (
    <>
      <span className="eyebrow">TEREN · NALOG</span>
      <h1>{workspaces.length && !workspace ? "Izaberi firmu" : "Vaš nalog"}</h1>
      <p className="break-words text-[#60716c]">
        Prijavljeni ste kao {user.email}. Email adresa je potvrđena.
      </p>
      {!!workspaces.length && <p className="mt-4">Izaberite firmu u kojoj nastavljate rad. Vaša uloga je prikazana uz svaku firmu.</p>}
      <h2 className="mt-8 mb-4 text-lg">Vaši timovi</h2>
      {workspaces.length ? (
        <>
          <ul className="grid list-none gap-4 p-0">
            {workspaces.map(({ organization, role }) => (
              <li key={organization.id} className="card min-w-0 break-words">
                <h3>{organization.display_name}</h3>
                <p>
                  {roleLabels[role]} · {organization.time_zone}
                </p>
                {workspace?.organization.id === organization.id && <p className="text-sm">Trenutno izabrana firma</p>}
                <WorkspaceChoice id={organization.id} name={organization.display_name} next={next} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="card">
          <h3>Još nemate radni prostor</h3>
          <p>
            Napravite prostor svoje firme. Ako vas je firma pozvala, otvorite link iz poziva i koristite pozvanu imejl adresu.
          </p>
          <Link href="/onboarding" className="button primary mt-4">
            Napravi radni prostor
          </Link>
        </div>
      )}
      {!!workspaces.length && <form action={beginOnboarding} data-offline-boundary="switch" className="mt-6">
        <input type="hidden" name="operationId" value={randomUUID()} />
        <button className="button secondary" type="submit">
          Novi radni prostor
        </button>
      </form>}
      <form action={signOut} data-offline-boundary="discard" className="mt-5">
        <button className="button secondary" type="submit">
          Odjavi se
        </button>
      </form>
    </>
  );
}
export default function AccountPage(props: PageProps<"/account">) {
  return (
    <AuthShell wide>
      <Suspense fallback={<AuthLoading />}>
        <AccountContent {...props} />
      </Suspense>
    </AuthShell>
  );
}

export const metadata = { title: "Moj nalog" };
