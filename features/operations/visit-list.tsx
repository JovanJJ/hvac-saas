import type { ScheduledVisit } from "./types";
export function VisitList({ visits }: { visits: ScheduledVisit[] }) {
  return (
    <div className="mt-6 grid gap-4">
      {!visits.length && <p>Nema zakazanih poseta.</p>}
      {visits.map((visit) => (
        <article key={visit.id} className="card">
          <h2>{visit.site}</h2>
          <p>{visit.address}</p>
          <p>
            {new Date(visit.start).toLocaleString("sr-Latn-RS", {
              timeZone: visit.timeZone,
            })}{" "}
            –{" "}
            {new Date(visit.end).toLocaleTimeString("sr-Latn-RS", {
              timeZone: visit.timeZone,
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {visit.timeZone}
          </p>
          <p>
            {visit.visitType === "maintenance"
              ? "Održavanje"
              : visit.visitType === "repair"
                ? "Popravka"
                : "Ugradnja"}{" "}
            · {visit.systems.length} sistema
          </p>
          <ul>
            {visit.systems.map((system) => (
              <li key={system.id}>
                {system.code} · {system.room}
              </li>
            ))}
          </ul>
          {visit.accessNote && <p>Pristup: {visit.accessNote}</p>}
        </article>
      ))}
    </div>
  );
}
