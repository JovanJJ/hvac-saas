import { Suspense } from "react";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { AuthLoading } from "@/features/auth/auth-screen";
import { VisitList } from "@/features/operations/visit-list";
import { visitStatusLabels } from "@/features/visits/model";
import { scheduleSnapshot, scheduleDetail } from "./dal";
import { ScheduleChangeForm } from "./form";
import {
  changeLabels,
  scheduleLink,
  shiftDate,
  type SearchParams,
} from "./model";
export async function ScheduleBoard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { visits, sites, staff, filters } = await scheduleSnapshot(
    await searchParams,
  );
  return (
    <>
      <h1>Raspored</h1>
      <p>
        Datumi i vremena poseta prikazani su u vremenskoj zoni njihove lokacije.
      </p>
      {filters.invalid && (
        <p role="alert">
          Filteri nisu ispravni. Prikazan je današnji raspored.
        </p>
      )}
      <form
        method="get"
        action="/schedule"
        className="card my-5 space-y-4"
        aria-label="Filteri rasporeda"
      >
        <div className="form-grid">
          <label className="min-w-0">
            Datum
            <input
              type="date"
              name="date"
              defaultValue={filters.date}
              required
            />
          </label>
          <label className="min-w-0">
            Prikaz
            <select className="min-w-0" name="view" defaultValue={filters.view}>
              <option value="day">Dan</option>
              <option value="week">Nedelja</option>
            </select>
          </label>
          <label className="min-w-0">
            Lokacija
            <select className="min-w-0" name="site" defaultValue={filters.site}>
              <option value="">Sve lokacije</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} · {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            Član tima
            <select
              className="min-w-0"
              name="technician"
              defaultValue={filters.technician}
            >
              <option value="">Svi članovi</option>
              {staff.map((member) => (
                <option key={member.membership_id} value={member.membership_id}>
                  {member.email}
                  {member.active ? "" : " · neaktivan"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="cancelled"
            className="w-5"
            defaultChecked={filters.cancelled}
          />
          Prikaži i otkazane posete
        </label>
        <button className="button primary" type="submit">
          Prikaži raspored
        </button>
      </form>
      <nav aria-label="Datumi rasporeda" className="my-5 flex flex-wrap gap-3">
        <Link
          className="button secondary"
          href={scheduleLink(
            filters,
            shiftDate(filters.from, filters.view === "week" ? -7 : -1),
          )}
        >
          {filters.view === "week" ? "Prethodna nedelja" : "Prethodni dan"}
        </Link>
        <p>
          {filters.from}
          {filters.from !== filters.until ? ` — ${filters.until}` : ""}
        </p>
        <Link
          className="button secondary"
          href={scheduleLink(
            filters,
            shiftDate(filters.from, filters.view === "week" ? 7 : 1),
          )}
        >
          {filters.view === "week" ? "Sledeća nedelja" : "Sledeći dan"}
        </Link>
      </nav>
      <VisitList visits={visits} manageSchedule />
    </>
  );
}
async function DetailContent({ id }: { id: string }) {
  const { detail, staff } = await scheduleDetail(id);
  const date = (instant: string) =>
    new Date(instant).toLocaleString("sr-Latn-RS", {
      timeZone: detail.timeZone,
    });
  const memberNames = (ids: string[]) =>
    ids
      .map(
        (id) =>
          staff.find((member) => member.membership_id === id)?.email ??
          `član ${id.slice(0, 8)}`,
      )
      .join(", ");
  const editable = ["scheduled", "in_progress"].includes(detail.status);
  return (
    <div className="min-w-0 break-words">
      <Link href="/schedule">Nazad na raspored</Link>
      <h1>Raspored posete · {detail.site}</h1>
      <p>Stanje: {visitStatusLabels[detail.status]}</p>
      <p>
        {date(detail.start)} — {date(detail.end)} · {detail.timeZone}
      </p>
      <p>Dodeljeni članovi: {memberNames(detail.members)}</p>
      {detail.status === "cancelled" && (
        <section className="card my-5">
          <h2>Poseta je otkazana</h2>
          <p>Razlog: {detail.cancellationReason}</p>
          <p>{detail.cancelledAt ? date(detail.cancelledAt) : ""}</p>
          <p>
            Nalazi, fotografije i prethodne dodele su sačuvani. Poseta nije u
            aktivnom rasporedu.
          </p>
        </section>
      )}
      <Link className="button secondary" href={`/visits/${id}/review`}>
        Otvori nalaze posete
      </Link>
      {editable ? (
        <>
          <p>
            Promena proverava poslednju verziju posete. Posle uspešnog čuvanja
            osvežite stranicu pre sledeće promene.
          </p>
          {(["reschedule", "reassign", "cancel"] as const).map((kind) => (
            <ScheduleChangeForm
              key={`${id}-${kind}`}
              detail={detail}
              kind={kind}
              operationId={randomUUID()}
              staff={staff}
            />
          ))}
        </>
      ) : (
        <p>Raspored predate, izdate ili otkazane posete je zaključan.</p>
      )}
      <section aria-label="Istorija rasporeda" className="my-8 space-y-4">
        <h2>Istorija rasporeda</h2>
        {!detail.history.length && <p>Još nema promena rasporeda.</p>}
        {detail.history.map((event) => (
          <article className="card" key={event.operationId}>
            <h3>{changeLabels[event.kind]}</h3>
            <p>
              {date(event.at)} ·{" "}
              {staff.find((member) => member.user_id === event.actor)?.email ??
                `član ${event.actor.slice(0, 8)}`}
            </p>
            {event.kind === "reschedule" ? (
              <>
                <p>
                  Pre: {date(event.before.scheduled_at)} —{" "}
                  {date(event.before.ends_at)}
                </p>
                <p>
                  Posle: {event.data.start?.replace("T", " ")} —{" "}
                  {event.data.end?.replace("T", " ")} · {event.data.timeZone}
                </p>
              </>
            ) : event.kind === "reassign" ? (
              <>
                <p>Pre: {memberNames(event.before.members)}</p>
                <p>Posle: {memberNames(event.data.members ?? [])}</p>
              </>
            ) : (
              <p>Razlog: {event.data.reason}</p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
async function ResolvedDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StaffPage path={`/schedule/${id}`} roles={["owner", "coordinator"]}>
      {() => <DetailContent id={id} />}
    </StaffPage>
  );
}
export function ScheduleDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ResolvedDetail {...props} />
    </Suspense>
  );
}
