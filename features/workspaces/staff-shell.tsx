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
import { StaffNavigation } from "./staff-navigation";
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
    <div className={`staff-shell mx-auto grid w-full gap-6 px-4 py-5 sm:px-6 print:block print:p-0 ${workspace.role === "technician" ? "max-w-5xl" : "max-w-[1480px] lg:grid-cols-[15rem_minmax(0,1fr)]"}`}>
      <a href="#staff-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-white focus:p-4">Pređi na sadržaj</a>
      <header className={`min-w-0 rounded-xl border border-[#dce4df] bg-white p-4 sm:p-5 ${workspace.role !== "technician" ? "lg:col-span-2" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-3xl font-extrabold no-underline">teren.</Link>
          <span className="rounded-full bg-[#e6f0eb] px-3 py-1 text-sm font-semibold text-[#08665f]">{roleLabels[workspace.role]}</span>
        </div>
        <details data-workspace-controls className="mt-3 min-w-0 border-t border-[#dce4df] pt-2">
          <summary className="cursor-pointer break-words py-2 font-semibold">Firma i nalog · {workspace.organization.display_name}</summary>
          <div className="mt-3 grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-label="Izbor firme" className="min-w-0">
              <p className="break-all text-sm text-[#60716c]">{user.email}</p>
              <WorkspaceSwitcher key={workspace.organization.id} workspaces={workspaces} selected={workspace.organization.id} />
            </section>
            <nav aria-label="Podešavanja i nalog" className="flex flex-wrap gap-x-5 gap-y-3 py-4 text-sm underline">
              <Link href="/account">Moj nalog</Link>
              {workspace.role === "owner" && <>
                <Link href="/settings/team">Tim i pozivi</Link>
                <Link href="/settings/workspace">Podaci firme</Link>
                <Link href="/settings/exports">Izvoz podataka</Link>
              </>}
            </nav>
          </div>
        </details>
      </header>
      <aside data-staff-navigation className={`min-w-0 self-start ${workspace.role !== "technician" ? "lg:sticky lg:top-5" : ""}`}>
        <StaffNavigation key={`${workspace.organization.id}:${workspace.role}`} role={workspace.role} />
      </aside>
      <main id="staff-content" tabIndex={-1} className="m-0 min-w-0 max-w-none p-0">
        <p className="eyebrow">{workspace.organization.display_name}</p>
        {children}
      </main>
      <footer className={`min-w-0 border-t border-[#dce4df] pt-5 ${workspace.role !== "technician" ? "lg:col-start-2" : ""}`}>
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
  const context = await requireWorkspace(roles, path);
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
