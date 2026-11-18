import { DownloadControl } from "@/features/offline/download-control";
import type { ScheduledVisit } from "./types";
import Link from "next/link";
export function VisitList({
  visits,
  offlineScope,
}: {
  visits: ScheduledVisit[];
  offlineScope?: { userId: string; organizationId: string };
}) {
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
          {offlineScope ? (
            <>
              <a href={`/visits/${visit.id}`} className="button primary mt-4">
                Otvori posetu
              </a>
              <DownloadControl visitId={visit.id} {...offlineScope} />
            </>
          ) : (
            <Link href={`/visits/${visit.id}`} className="button primary mt-4">
              Otvori posetu
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
