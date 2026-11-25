import { Suspense } from "react";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AuthLoading } from "@/features/auth/auth-screen";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { registerDetail } from "./dal";
import { RegisterForm } from "./form";
import { ServiceHistory } from "./history";
import { fields, formValues, type RegisterKind } from "./model";
import { RegisterBreadcrumbs, IdentityFields, RegisterSection, RegisterTools, recordTitle } from "./register-ui";
import { RegisterList } from "@/features/operations/register-list";
import { SystemUnits } from "./units";
import { RegisterOpenActions } from "./open-actions";
const paths = { customer: "customers", site: "sites", system: "systems" };
async function DetailContent({ kind, id }: { kind: RegisterKind; id: string }) {
  const { context, detail } = await registerDetail(kind, id);
  const { record, parent, units, children, history } = detail;
  const office = context.workspace.role !== "technician";
  const values = formValues(record);
  const active = !record.archived_at;
  // Only office roles may fetch the site's parent; a technician gets no customer/site browsing.
  const ancestor = office && kind === "system" && parent ? (await registerDetail("site", parent.id)).detail.parent : null;
  const breadcrumbs = office ? [
    { label: "Klijenti", href: "/customers" },
    ...(ancestor ? [{ label: ancestor.name, href: `/customers/${ancestor.id}` }] : []),
    ...(parent ? [{ label: parent.name, href: `/${kind === "site" ? "customers" : "sites"}/${parent.id}` }] : []),
    { label: recordTitle(record) },
  ] : [{ label: "Danas", href: "/today" }, { label: recordTitle(record) }];
  const siteId = kind === "site" ? id : kind === "system" ? parent?.id : undefined;
  const canCreate = office && active && !parent?.archived;
  return (
    <div className="min-w-0 break-words">
      <RegisterBreadcrumbs items={breadcrumbs} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1>{recordTitle(record)}</h1><p>{active ? "Aktivan zapis" : "Arhivirano · istorija je sačuvana"}</p></div>
        <div className="flex flex-wrap gap-3">
          {canCreate && kind === "customer" && <Link href={`/sites?customer=${id}#new-record`} className="button primary">Dodaj lokaciju</Link>}
          {canCreate && kind === "site" && <Link href={`/systems?site=${id}#new-record`} className="button secondary">Dodaj sistem</Link>}
          {canCreate && siteId && <Link href={`/visits/new?site=${siteId}`} className="button primary">Zakaži posetu</Link>}
        </div>
      </div>
      {parent && <p>{kind === "site" ? "Klijent" : "Lokacija"}: {office ? <Link className="underline" href={`/${kind === "site" ? "customers" : "sites"}/${parent.id}`}>{parent.name}</Link> : parent.name}{parent.archived ? " · roditeljski zapis je arhiviran" : ""}</p>}
      {office && <RegisterTools owner={context.workspace.role === "owner"} siteId={siteId} />}
      <nav aria-label="Odeljci zapisa" className="my-6 flex flex-wrap gap-x-5 gap-y-3 text-sm underline">
        <a href="#register-identity">Podaci</a>
        {kind !== "system" && <a href="#register-children">{kind === "customer" ? "Lokacije klijenta" : "Sistemi lokacije"}</a>}
        {kind === "system" && <a href="#system-units">Komponente sistema</a>}
        <a href="#register-open-actions">Otvorene radnje</a><a href="#service-history">Servisna istorija</a>
        {office && active && <a href="#register-edit">Uredi podatke</a>}
      </nav>
      <RegisterSection id="register-identity" title={kind === "customer" ? "Podaci klijenta" : kind === "site" ? "Podaci lokacije" : "Podaci sistema"}>
        <div className="rounded-xl border border-[#dce4df] bg-white p-5"><IdentityFields items={fields[kind].map(([key, label]) => ({ label, value: values[key as keyof typeof values] }))} /></div>
      </RegisterSection>
      {kind !== "system" && <RegisterSection id="register-children" title={kind === "customer" ? "Lokacije klijenta" : "Sistemi lokacije"}>
        <RegisterList key={id} kind={kind === "customer" ? "site" : "system"} rows={children} sites={kind === "site" ? [record] : children} customers={kind === "customer" ? [record] : []} showParentFilter={false} />
      </RegisterSection>}
      <RegisterOpenActions entries={history} office={office} />
      {kind === "system" && <SystemUnits units={units} systemId={id} version={record.version} editable={canCreate} />}
      <ServiceHistory entries={history} office={office} />
      {office && active && (
        <div id="register-edit" tabIndex={-1} className="scroll-mt-5"><RegisterForm
          key={`edit-${record.id}`}
          entity={kind}
          entityId={record.id}
          version={record.version}
          operationId={randomUUID()}
          initial={values}
          title="Uredi podatke"
        /></div>
      )}
      {office && (
        <RegisterForm
          key={`archive-${record.version}`}
          entity={kind}
          entityId={record.id}
          version={record.version}
          operationId={randomUUID()}
          action={active ? "archive" : "restore"}
          title={active ? "Arhiviranje zapisa" : "Ponovno aktiviranje"}
        />
      )}

    </div>
  );
}
async function ResolvedDetail({
  kind,
  params,
}: {
  kind: RegisterKind;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <StaffPage
      path={`/${paths[kind]}/${id}`}
      roles={kind === "system" ? undefined : ["owner", "coordinator"]}
    >
      {() => <DetailContent kind={kind} id={id} />}
    </StaffPage>
  );
}
export function RegisterDetailPage(props: {
  kind: RegisterKind;
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ResolvedDetail {...props} />
    </Suspense>
  );
}
