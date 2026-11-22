"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { applyImport, type ImportState } from "./actions";
import type { ImportApplication, ImportPreview } from "./model";
export function ImportApplyForm({
  batchId,
  preview,
  operationId,
}: {
  batchId: string;
  preview: ImportPreview;
  operationId: string;
}) {
  // Pin the exact reviewed identity/digest until a newly reviewed preview remounts this form.
  const [base] = useState({
    batchId,
    previewId: preview.id,
    digest: preview.digest,
    operationId,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(
    applyImport,
    {} as ImportState,
  );
  return (
    <form
      action={action}
      className="card my-5 space-y-4"
      onReset={(event) => event.preventDefault()}
      aria-label="Potvrda uvoza"
    >
      <h3>Primeni pregledani uvoz</h3>
      <p>
        Potvrđujete sve redove ovog pregleda. Menjaju se samo povezana polja
        sistema; prazna povezana opciona polja brišu postojeće vrednosti. Oznake
        i pripadnost postojećih sistema ostaju sačuvane.
      </p>
      {Object.entries(base).map(([name, value]) => (
        <input key={name} name={name} value={value} type="hidden" />
      ))}
      <fieldset disabled={pending || state.success} className="m-0 space-y-4">
        <label className="flex items-start gap-3 font-normal">
          <input
            name="confirmed"
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 w-auto shrink-0"
          />
          Potvrđujem pregledane podatke i upis u registar.
        </label>
        <button className="button primary" disabled={pending || state.success}>
          {pending ? "Primena uvoza…" : "Potvrdi i primeni uvoz"}
        </button>
      </fieldset>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function ImportApplicationResult({
  application,
}: {
  application: ImportApplication;
}) {
  const labels = {
    created: "Kreiran",
    updated: "Ažuriran",
    skipped: "Bez promene",
  };
  return (
    <section
      className="card my-5 min-w-0 break-words space-y-4"
      aria-label="Rezultat primene"
    >
      <h2>Uvoz je primenjen</h2>
      <p>
        Kreirano: {application.created} · Ažurirano: {application.updated} ·
        Preskočeno: {application.skipped}
      </p>
      <p>
        Preskočeni sistemi već imaju pregledane vrednosti. Njihove verzije nisu
        promenjene.
      </p>
      <p>
        Vreme primene:{" "}
        <time dateTime={application.appliedAt}>
          {new Date(application.appliedAt)
            .toISOString()
            .replace("T", " ")
            .replace(/\.\d+Z$/, " UTC")}
        </time>
      </p>
      <ul className="space-y-3">
        {application.rows.map((row) => (
          <li key={row.number}>
            Red {row.number} · {labels[row.action]} ·{" "}
            <Link href={`/systems/${row.systemId}`}>{row.code}</Link> ·{" "}
            <Link href={`/sites/${row.siteId}`}>Lokacija</Link>
          </li>
        ))}
      </ul>
      <details className="break-all">
        <summary>Identifikator primenjenog pregleda</summary>
        <p>{application.digest}</p>
      </details>
    </section>
  );
}
