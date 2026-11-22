import Link from "next/link";
import { SelectField } from "@/components/ui/select-field";
import { workQueue } from "./dal";
import { taskLabels } from "./model";
import {
  bookingLabels,
  dependencyLabels,
  dueLabels,
  queueStates,
  readQueueFilters,
  queueLink,
  type QueueRow,
} from "./queue-model";

function Options({ labels }: { labels: Record<string, string> }) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>{label}</option>
  ));
}

function WorkCard({ row }: { row: QueueRow }) {
  const maintenance = row.kind === "maintenance";
  const localTime = (instant: string) =>
    new Date(instant).toLocaleString("sr-Latn-RS", { timeZone: row.timeZone });
  return (
    <article className="card my-5 min-w-0 break-words">
      <h2>
        <Link href={maintenance ? `/maintenance/${row.planId}` : `/office/actions/${row.id}`}>
          {row.kind === "maintenance"
            ? row.planName
            : `${taskLabels[row.kind]} · ${row.code}`}
        </Link>
      </h2>
      <p>{row.customer} · {row.site}{row.room ? ` · ${row.room}` : ""}</p>
      <p>Stanje: {queueStates[row.state]}{row.overdue ? " · U kašnjenju" : ""}</p>
      <p>
        {maintenance ? "Odgovoran tim" : "Odgovoran"}: {row.owner || "Nedostaje odgovoran"}
        {" · "}{maintenance ? "Datum posete" : "Rok radnje"}: {row.dueDate || "Nedostaje"}
      </p>
      <p>{row.finding || row.noAccessReason || row.work}</p>
      {row.customerAction && (
        <p><strong>Potrebno od klijenta:</strong> {row.customerAction}</p>
      )}
      {row.bookingState === "proposed" && (
        <p>{maintenance
          ? "Predlog prema planu; poseta još nije kreirana."
          : "Povratna poseta još nije zakazana."}</p>
      )}
      {maintenance && row.planEnabled === false && (
        <p>Plan je pauziran. Postojeće posete ostaju zakazane.</p>
      )}
      {row.start && <p>{localTime(row.start)} · {row.timeZone}</p>}
      {!maintenance && (
        <Link href={`/visits/${row.visitId}/review#system-${row.itemId}`}>
          Otvori izvorni nalaz
        </Link>
      )}
      {row.returnVisitId && (
        <div className="my-3">
          <p>
            Povratna poseta: {queueStates[row.returnState as keyof typeof queueStates] || row.returnState}
            {" · "}{row.returnStart && localTime(row.returnStart)} · {row.timeZone}
          </p>
          <Link href={`/schedule/${row.returnVisitId}`}>Raspored povratne posete</Link>
        </div>
      )}
      {maintenance && row.visitId && (
        <Link href={`/schedule/${row.visitId}`}>Raspored posete</Link>
      )}
      {!maintenance && row.state === "open" && row.kind !== "quote" && !row.returnVisitId && (
        <p>
          <Link className="button secondary" href={`/office/actions/${row.id}`}>
            Zakaži povratnu posetu
          </Link>
        </p>
      )}
    </article>
  );
}

export async function WorkQueues({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filters, invalid } = readQueueFilters(await searchParams);
  const { data, members } = await workQueue(filters);
  const maintenance = filters.queue === "maintenance";
  const actionStates = ["pending", "all", "open", "completed", "quote", "repair", "revisit"];
  const states = Object.fromEntries(Object.entries(queueStates).filter(([key]) =>
    maintenance
      ? !["open", "completed", "quote", "repair", "revisit"].includes(key)
      : actionStates.includes(key),
  ));
  return (
    <>
      <h1>Sledeće radnje</h1>
      <nav aria-label="Pregledi obaveza" className="my-5 flex flex-wrap gap-3">
        <Link
          className={`button ${maintenance ? "secondary" : "primary"}`}
          aria-current={!maintenance ? "page" : undefined}
          href={queueLink(filters, { queue: "actions", state: "pending", page: 1 })}
        >Radnje iz nalaza</Link>
        <Link
          className={`button ${maintenance ? "primary" : "secondary"}`}
          aria-current={maintenance ? "page" : undefined}
          href={queueLink(filters, {
            queue: "maintenance", state: "pending", dependency: "all", booking: "all", page: 1,
          })}
        >Održavanje iz planova</Link>
      </nav>
      <p>{maintenance
        ? "Kreirane posete i sledeći nekreirani predlog po planu. Predlog nije zakazana poseta; pripremite ga na stranici plana."
        : "Rok radnje, termin povratne posete i završetak radnje vode se odvojeno."}</p>
      {invalid && <p role="alert">Neispravni filteri su vraćeni na početni prikaz.</p>}
      <form
        key={JSON.stringify(filters)} method="get" action="/office/actions"
        aria-label="Filteri obaveza" className="card my-5 space-y-4"
      >
        <input type="hidden" name="queue" value={filters.queue} />
        <div className="form-grid">
          <SelectField label="Odgovoran član" name="owner" defaultValue={filters.owner}>
            <option value="">Svi članovi</option>
            {members.map(m => (
              <option key={m.membership_id} value={m.membership_id}>
                {m.email}{m.active ? "" : " · neaktivan"}
              </option>
            ))}
          </SelectField>
          <SelectField label="Lokacija" name="site" defaultValue={filters.site}>
            <option value="">Sve lokacije</option>
            {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <SelectField label="Stanje obaveze" name="state" defaultValue={filters.state}>
            <Options labels={states} />
          </SelectField>
          <SelectField label="Rok" name="due" defaultValue={filters.due}>
            <Options labels={dueLabels} />
          </SelectField>
          <SelectField
            label={maintenance ? "Priprema termina" : "Povratna poseta"}
            name="booking" defaultValue={filters.booking}
          >
            <Options labels={maintenance
              ? { all: "Svi termini", proposed: "Predlog termina", booked: "Kreirana poseta" }
              : bookingLabels} />
          </SelectField>
          {!maintenance && (
            <SelectField label="Zahtev za klijenta" name="dependency" defaultValue={filters.dependency}>
              <Options labels={dependencyLabels} />
            </SelectField>
          )}
        </div>
        <button className="button primary">Prikaži obaveze</button>
        <Link className="button secondary" href={queueLink({
          ...filters, site: "", owner: "", due: "all", state: "pending",
          booking: "all", dependency: "all", page: 1,
        })}>Poništi filtere</Link>
      </form>
      <p>Ukupno: {data.total} · Stranica {data.page}</p>
      {!data.rows.length && <p>Nema obaveza za izabrane filtere.</p>}
      {data.rows.map(row => <WorkCard key={row.id} row={row} />)}
      <nav aria-label="Stranice obaveza" className="my-5 flex flex-wrap gap-3">
        {data.page > 1 && (
          <Link href={queueLink(filters, { page: data.page - 1 })}>Prethodna stranica</Link>
        )}
        {data.page * 30 < data.total && (
          <Link href={queueLink(filters, { page: data.page + 1 })}>Sledeća stranica</Link>
        )}
      </nav>
    </>
  );
}
