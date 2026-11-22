import { recurrenceNote, type Occurrence } from "./model";
export function Occurrences({
  rows,
  title,
}: {
  rows: Occurrence[];
  title: string;
}) {
  return (
    <section aria-label={title} className="my-5 space-y-4">
      <h2>{title}</h2>
      <p>
        Predlog termina prema podešavanjima plana. Kreirane posete su prikazane
        odvojeno.
      </p>
      <ol className="m-0 list-none p-0 space-y-4">
        {rows.map((row) => (
          <li
            key={row.intendedDate}
            className="card min-w-0 break-words space-y-2"
          >
            <p>
              <strong>{row.intendedLocal.replace("T", " ")}</strong> ·{" "}
              {row.timeZone}
            </p>
            <p>
              Stvarni lokalni početak: {row.resolvedLocal.replace("T", " ")}
            </p>
            <details>
              <summary>Detalji vremenske zone</summary>
              <p>
                Početak UTC:{" "}
                <time dateTime={row.startsAt}>
                  {new Date(row.startsAt).toISOString()}
                </time>
              </p>
              <p>
                Završetak UTC:{" "}
                <time dateTime={row.endsAt}>
                  {new Date(row.endsAt).toISOString()}
                </time>
              </p>
            </details>
            {recurrenceNote(row) && <p>{recurrenceNote(row)}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
