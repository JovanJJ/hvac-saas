import { Suspense } from "react";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AuthLoading } from "@/features/auth/auth-screen";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { registerDetail } from "./dal";
import { RegisterForm } from "./form";
import { ServiceHistory } from "./history";
import { fields, formValues, type RegisterKind } from "./model";
const paths = { customer: "customers", site: "sites", system: "systems" };
async function DetailContent({ kind, id }: { kind: RegisterKind; id: string }) {
  const { context, detail } = await registerDetail(kind, id);
  const { record, parent, units, children, history } = detail;
  const office = context.workspace.role !== "technician";
  const values = formValues(record);
  const active = !record.archived_at;
  return (
    <div className="min-w-0 break-words">
      {office && (
        <Link className="underline" href={`/${paths[kind]}`}>
          Nazad na registar
        </Link>
      )}
      <h1>
        {record.code ? `${record.code} · ` : ""}
        {record.name ?? record.room}
      </h1>
      <p>{active ? "Aktivan zapis" : "Arhivirano · istorija je sačuvana"}</p>
      {parent && (
        <p>
          {kind === "site" ? "Klijent" : "Lokacija"}:{" "}
          {office ? (
            <Link
              href={`/${kind === "site" ? "customers" : "sites"}/${parent.id}`}
            >
              {parent.name}
            </Link>
          ) : (
            parent.name
          )}
          {parent.archived ? " · roditeljski zapis je arhiviran" : ""}
        </p>
      )}
      <dl className="card my-5 grid gap-3">
        {fields[kind].map(([key, label]) => (
          <div key={key}>
            <dt className="font-semibold">{label}</dt>
            <dd className="m-0 break-words">
              {String(values[key as keyof typeof values] || "Nije uneto")}
            </dd>
          </div>
        ))}
      </dl>
      {office && active && (
        <RegisterForm
          key={`edit-${record.id}`}
          entity={kind}
          entityId={record.id}
          version={record.version}
          operationId={randomUUID()}
          initial={values}
          title="Uredi podatke"
        />
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
      {kind !== "system" && (
        <section className="my-6 space-y-3">
          <h2>
            {kind === "customer" ? "Lokacije klijenta" : "Sistemi lokacije"}
          </h2>
          {!children.length && <p>Nema povezanih zapisa.</p>}
          {children.map((child) => (
            <article key={child.id} className="card">
              <Link
                className="underline"
                href={`/${kind === "customer" ? "sites" : "systems"}/${child.id}`}
              >
                {child.code} · {child.name ?? child.room}
              </Link>
              {child.archived_at && <p>Arhivirano</p>}
            </article>
          ))}
          {office && active && !parent?.archived && (
            <div className="flex flex-wrap gap-3">
              <Link
                className="button secondary"
                href={
                  kind === "customer"
                    ? `/sites?customer=${id}`
                    : `/systems?site=${id}`
                }
              >
                {kind === "customer" ? "Dodaj lokaciju" : "Dodaj sistem"}
              </Link>
              {kind === "site" && (
                <Link
                  className="button secondary"
                  href={`/visits/new?site=${id}`}
                >
                  Zakaži posetu
                </Link>
              )}
            </div>
          )}
        </section>
      )}
      {kind === "system" && (
        <section className="my-8 space-y-4" aria-label="Komponente sistema">
          <h2>Komponente sistema</h2>
          <p>
            Zamena arhivira staru jedinicu. Identitet sistema i raniji nalazi
            ostaju sačuvani.
          </p>
          {!units.length && <p>Još nema evidentiranih komponenti.</p>}
          {units.map((unit) => (
            <article className="card my-4" key={unit.id}>
              <h3>
                {unit.role === "indoor"
                  ? "Unutrašnja jedinica"
                  : "Spoljašnja jedinica"}{" "}
                · {unit.model || "Model nije unet"}
              </h3>
              <p>Proizvođač: {unit.manufacturer || "Nije uneto"}</p>
              <p>Serijski broj: {unit.serial || "Nije uneto"}</p>
              <p>
                {unit.archived_at
                  ? "Arhivirana komponenta"
                  : "Aktivna komponenta"}
              </p>
              {unit.replaces_id && (
                <p>
                  Zamena prethodne komponente · {unit.replaces_id.slice(0, 8)}
                </p>
              )}
              {office && active && !parent?.archived && !unit.archived_at && (
                <>
                  <details>
                    <summary>Uredi komponentu</summary>
                    <RegisterForm
                      key={`unit-${unit.id}`}
                      entity="unit"
                      entityId={unit.id}
                      version={unit.version}
                      operationId={randomUUID()}
                      initial={unit}
                      title="Podaci komponente"
                    />
                  </details>
                  <details>
                    <summary>Zameni komponentu</summary>
                    <RegisterForm
                      key={`replace-${unit.id}-${unit.version}`}
                      entity="unit"
                      entityId={unit.id}
                      version={unit.version}
                      operationId={randomUUID()}
                      action="replace"
                      initial={{ role: unit.role }}
                      title="Nova komponenta"
                    />
                  </details>
                  <details>
                    <summary>Arhiviraj komponentu</summary>
                    <RegisterForm
                      key={`remove-${unit.id}-${unit.version}`}
                      entity="unit"
                      entityId={unit.id}
                      version={unit.version}
                      operationId={randomUUID()}
                      action="archive"
                      title="Arhiviranje komponente"
                    />
                  </details>
                </>
              )}
            </article>
          ))}
          {office && active && !parent?.archived && (
            <RegisterForm
              entity="unit"
              entityId={id}
              version={record.version}
              operationId={randomUUID()}
              action="create"
              title="Dodaj komponentu"
            />
          )}
        </section>
      )}
      <ServiceHistory entries={history} office={office} />
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
