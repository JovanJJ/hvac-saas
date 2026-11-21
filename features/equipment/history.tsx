import Link from "next/link";
import {
  outcomeLabels,
  readingLabels,
  actionLabels,
} from "@/features/visits/model";
import type { HistoryEntry } from "./model";
export function ServiceHistory({
  entries,
  office,
}: {
  entries: HistoryEntry[];
  office: boolean;
}) {
  return (
    <section className="my-8 space-y-4" aria-label="Servisna istorija">
      <h2>Servisna istorija</h2>
      <p>
        Predati i izdati nalazi za ovu opremu. Izmene u registru ne menjaju
        izdate izveštaje.
      </p>
      {!entries.length && <p>Još nema predatih nalaza.</p>}
      {entries.map((entry) => (
        <article className="card space-y-2" key={entry.itemId}>
          <h3>
            {entry.code} ·{" "}
            {new Date(entry.date).toLocaleDateString("sr-Latn-RS", {
              timeZone: entry.timeZone,
            })}
          </h3>
          <p>{outcomeLabels[entry.outcome]}</p>
          {entry.work && <p>Radovi: {entry.work}</p>}
          {entry.finding && <p>Nalaz: {entry.finding}</p>}
          {entry.noAccessReason && <p>Bez pristupa: {entry.noAccessReason}</p>}
          {entry.enteredBy && (
            <p>
              Evidentirao:{" "}
              {entry.enteredByLabel || `član ${entry.enteredBy.slice(0, 8)}`} ·{" "}
              {entry.enteredAt
                ? new Date(entry.enteredAt).toLocaleString("sr-Latn-RS", {
                    timeZone: entry.timeZone,
                  })
                : "Vreme nije zabeleženo"}
            </p>
          )}
          {entry.correctedAt && (
            <p>
              Kancelarijska dopuna:{" "}
              {new Date(entry.correctedAt).toLocaleString("sr-Latn-RS", {
                timeZone: entry.timeZone,
              })}
            </p>
          )}
          {entry.readings.map((r, index) => (
            <p key={index}>
              {r.kind}:{" "}
              {r.status === "measured"
                ? `${r.value} ${r.unit}`
                : readingLabels[r.status as keyof typeof readingLabels]}
            </p>
          ))}
          {entry.parts.map((p, index) => (
            <p key={index}>
              Materijal: {p.name} · {p.quantity} {p.unit}
            </p>
          ))}
          {entry.followUp && (
            <p>
              {actionLabels[entry.followUp.kind]} ·{" "}
              {entry.followUp.state === "completed" ? "Završeno" : "Otvoreno"} ·
              Rok: {entry.followUp.dueDate} · {entry.followUp.customerAction}
            </p>
          )}
          {office && (
            <Link
              className="underline"
              href={`/visits/${entry.visitId}/review#system-${entry.itemId}`}
            >
              Otvori izvorni nalaz
            </Link>
          )}
        </article>
      ))}
    </section>
  );
}
