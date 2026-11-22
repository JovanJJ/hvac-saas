import { DownloadControl } from "@/features/offline/download-control";
import { visitStatusLabels } from "@/features/visits/model";
import type { ScheduledVisit } from "./types";
import Link from "next/link";
export function VisitList({
  visits,
  offlineScope,
  manageSchedule = false,
}: {
  visits: ScheduledVisit[];
  manageSchedule?: boolean;
  offlineScope?: { userId: string; organizationId: string };
}) {
  return (
    <div className="mt-6 grid gap-4">
      {!visits.length && <p>Nema zakazanih poseta.</p>}
      {visits.map((visit) => (
        <article key={visit.id} className="card min-w-0 break-words">
          <h2>{visit.site}</h2>
          <p>{visit.address}</p>
          {visit.planId && (
            <p>
              {manageSchedule ? (
                <Link href={`/maintenance/${visit.planId}`}>
                  Plan održavanja: {visit.planName}
                </Link>
              ) : (
                <>Planirano održavanje · {visit.intendedDate}</>
              )}
            </p>
          )}
          {visit.status && <p>Stanje: {visitStatusLabels[visit.status]}</p>}
          {visit.cancellationReason && (
            <p>Razlog otkazivanja: {visit.cancellationReason}</p>
          )}
          {manageSchedule && (
            <Link
              className="button secondary mt-3"
              href={`/schedule/${visit.id}`}
            >
              {visit.status &&
              ["scheduled", "in_progress"].includes(visit.status)
                ? "Izmeni raspored"
                : "Detalji rasporeda"}
            </Link>
          )}
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
