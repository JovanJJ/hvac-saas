import Link from "next/link";
import { DeviceCleanupControl } from "@/features/offline/lifecycle-control";
import { Suspense } from "react";
import { requireUser } from "@/features/auth/dal";
import { signOut } from "@/features/auth/actions";
import { AuthLoading } from "@/features/auth/auth-screen";
import type { StaffRole } from "@/lib/supabase/database.types";
import { requireWorkspace } from "./dal";
import { WorkspaceSwitcher } from "./forms";
import { roleLabels } from "./validation";
export type StaffContext = Awaited<ReturnType<typeof requireWorkspace>>;
export function StaffShell({
  context,
  children,
}: {
  context: StaffContext;
  children: React.ReactNode;
}) {
  const { workspace, user, workspaces } = context;
  return (
    <div className="staff-shell mx-auto w-full max-w-5xl px-5 py-6">
      <header className="mb-8 rounded-xl border border-[#dce4df] bg-white p-5">
        <div className="row mb-5">
          <Link href="/" className="text-3xl font-extrabold no-underline">
            teren.
          </Link>
          <span className="break-all text-sm text-[#60716c]">
            {user.email} · {roleLabels[workspace.role]}
          </span>
        </div>
        <WorkspaceSwitcher
          workspaces={workspaces}
          selected={workspace.organization.id}
        />
        <nav
          aria-label="Navigacija tima"
          className="mt-5 flex flex-wrap gap-4 text-sm underline"
        >
          {workspace.role !== "technician" && (
            <>
              <Link href="/office">Kancelarija</Link>
              <Link href="/office/actions">Sledeće radnje</Link>
              <Link href="/office/handover">Potvrde i naplata</Link>
              <Link href="/customers">Klijenti</Link>
              <Link href="/sites">Lokacije</Link>
              <Link href="/systems">Sistemi</Link>
              <Link href="/imports">Uvoz opreme</Link>
              <Link href="/schedule">Raspored</Link>
              <Link href="/maintenance">Planovi održavanja</Link>
              <Link href="/visits/new">Zakaži posetu</Link>
            </>
          )}
          <Link href="/today">Danas</Link>
          {workspace.role === "owner" && (
            <>
              <Link href="/settings/team">Tim i pozivi</Link>
              <Link href="/settings/workspace">Podaci firme</Link>
              <Link href="/settings/exports">Izvoz podataka</Link>
            </>
          )}
          <Link href="/account">Moj nalog</Link>
        </nav>
      </header>
      <main className="m-0 max-w-none p-0">
        <p className="eyebrow">{workspace.organization.display_name}</p>
        {children}
      </main>
      <footer className="mt-10 border-t border-[#dce4df] pt-5">
        <form action={signOut} data-offline-boundary="discard">
          <button className="button secondary" type="submit">
            Odjavi se
          </button>
        </form>
        <DeviceCleanupControl />
      </footer>
    </div>
  );
}
async function AuthorizedContent({
  roles,
  path,
  children,
}: {
  roles?: StaffRole[];
  path?: string;
  children: (context: StaffContext) => React.ReactNode;
}) {
  await requireUser(path);
  const context = await requireWorkspace(roles);
  return <StaffShell context={context}>{children(context)}</StaffShell>;
}
export function StaffPage({
  roles,
  path,
  children,
}: {
  roles?: StaffRole[];
  path?: string;
  children: (context: StaffContext) => React.ReactNode;
}) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthorizedContent roles={roles} path={path}>
        {children}
      </AuthorizedContent>
    </Suspense>
  );
}
