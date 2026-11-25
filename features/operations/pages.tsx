import Link from "next/link";
import { requireWorkspace } from "@/features/workspaces/dal";
import { StaffPageHeading } from "@/components/ui/staff-page-heading";
import { RegisterBreadcrumbs, RegisterTools, registerTitles, createLabels, recordTitle } from "@/features/equipment/register-ui";
import { randomUUID } from "node:crypto";
import { operationSnapshot } from "./dal";
import { OperationForm } from "./form";
import { ownerRoster } from "@/features/workspaces/dal";
import type { StaffContext } from "@/features/workspaces/staff-shell";
import { activeRegister } from "./active-register";
import { RegisterList } from "./register-list";
export async function RegisterContent({
  kind,
  selection,
}: {
  kind: "customer" | "site" | "system";
  selection?: Promise<{ site?: string; customer?: string }>;
}) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const snapshot = await operationSnapshot();
  const active = activeRegister(snapshot);
  const initial = await selection;
  const explicitParent = kind === "site" ? initial?.customer : kind === "system" ? initial?.site : undefined;
  const parents = kind === "site" ? active.customers : active.sites;
  const parent = typeof explicitParent === "string" ? parents.find(row => row.id === explicitParent) : undefined;
  const invalidParent = explicitParent !== undefined && !parent;
  const rows = kind === "customer" ? snapshot.customers : kind === "site" ? snapshot.sites : snapshot.systems;
  const needsParent = (kind === "site" && !active.customers.length) || (kind === "system" && !active.sites.length);
  return <>
    <RegisterBreadcrumbs items={[{ label: "Kancelarija", href: "/office" }, { label: registerTitles[kind] }]} />
    <StaffPageHeading title={registerTitles[kind]} description="Pronađite zapis, proverite podatke i nastavite ka lokaciji ili sistemu."
      action={<Link href="#new-record" className="button primary">{createLabels[kind]}</Link>} />
    <RegisterTools owner={context.workspace.role === "owner"} siteId={kind === "system" ? parent?.id : undefined} />
    {parent && <p className="my-5">Novi unos za: <Link className="underline" href={`/${kind === "site" ? "customers" : "sites"}/${parent.id}`}>{recordTitle(parent)}</Link></p>}
    <RegisterList key={`${kind}:${parent?.id ?? "all"}`} rows={rows} sites={snapshot.sites} customers={snapshot.customers} kind={kind} initialParentId={parent?.id} />
    <section id="new-record" tabIndex={-1} aria-labelledby="new-record-heading" className="my-10 scroll-mt-5">
      <h2 id="new-record-heading" tabIndex={-1}>{createLabels[kind]}</h2>
      {invalidParent ? <p role="alert">Izabrani klijent ili lokacija nije dostupan za novi unos. <Link className="underline" href={`/${kind === "site" ? "sites" : "systems"}`}>Izaberite aktivan zapis</Link>.</p>
      : needsParent ? <p>Prvo dodajte <Link className="underline" href={kind === "site" ? "/customers" : "/sites"}>{kind === "site" ? "klijenta" : "lokaciju"}</Link>.</p>
      : <OperationForm key={`${kind}:${parent?.id ?? "all"}`} kind={kind} operationId={randomUUID()} snapshot={snapshot} initialSiteId={kind === "system" ? parent?.id : undefined} initialCustomerId={kind === "site" ? parent?.id : undefined} />}
    </section>
  </>;
}

export async function SchedulingContent({
  context,
  selection,
}: {
  context: StaffContext;
  selection?: Promise<{ site?: string }>;
}) {
  const snapshot = await operationSnapshot();
  const active = activeRegister(snapshot);
  const initial = await selection;
  const members = await ownerRoster(context.workspace.organization.id);
  return (
    <>
      <h1>Zakaži posetu</h1>
      {active.systems.length ? (
        <OperationForm
          kind="visit"
          operationId={randomUUID()}
          snapshot={snapshot}
          members={members}
          initialSiteId={initial?.site}
        />
      ) : (
        <p>Prvo dodajte klijenta, lokaciju i sisteme.</p>
      )}
    </>
  );
}
