"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ImportApplyForm, ImportApplicationResult } from "./apply-form";
import { SelectField } from "@/components/ui/select-field";
import { previewImport, uploadImport, type ImportState } from "./actions";
import {
  importFields,
  suggestMapping,
  type ImportDetail,
  type ImportField,
  type ImportRow,
} from "./model";
const initial: ImportState = {};
export function ImportUpload({ operationId }: { operationId: string }) {
  const [state, action, pending] = useActionState(uploadImport, initial);
  return (
    <form
      action={action}
      className="card my-5 space-y-4"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="operationId" value={operationId} />
      <label>
        CSV ili XLSX fajl
        <input
          name="file"
          type="file"
          accept=".csv,.xlsx"
          required
          disabled={pending}
        />
      </label>
      <p>
        Do 512 KiB, 500 redova i 32 kolone. Prvi red sadrži jedinstvene nazive
        kolona.
      </p>
      <p>
        CSV: UTF-8, zarez, tačka-zarez ili tabulator. XLSX: jedan radni list,
        bez formula i makroa. Serijske brojeve čuvajte kao tekst da biste
        zadržali početne nule.
      </p>
      {state.message && <p role="alert">{state.message}</p>}
      <button className="button primary" disabled={pending}>
        {pending ? "Čitanje fajla…" : "Učitaj za pregled"}
      </button>
    </form>
  );
}
function RowResult({ row }: { row: ImportRow }) {
  return (
    <article
      className="card my-5 min-w-0 break-words space-y-4"
      aria-label={`Red ${row.number}`}
    >
      <h3>
        Red {row.number} ·{" "}
        {row.action === "new"
          ? "Novi sistem"
          : row.action === "matched"
            ? "Pronađen sistem"
            : "Potrebna ispravka"}
      </h3>
      <p>
        {row.values.siteCode || "Bez lokacije"} /{" "}
        {row.values.systemCode || "Bez oznake sistema"}
      </p>
      {row.errors.length > 0 && (
        <ul>
          {row.errors.map((error, index) => (
            <li key={index}>
              {error.replace(
                /\b(siteCode|systemCode|room|manufacturer|model|serial|systemType)\b/g,
                (field) => importFields[field as ImportField],
              )}
            </li>
          ))}
        </ul>
      )}
      {row.systemId && (
        <p>
          <Link href={`/systems/${row.systemId}`}>Otvori postojeći sistem</Link>
        </p>
      )}
      {row.siteId && (
        <p>
          <Link href={`/sites/${row.siteId}`}>Otvori lokaciju</Link>
        </p>
      )}
      <dl>
        {(Object.entries(row.values) as [ImportField, string][]).map(
          ([field, value]) => (
            <div key={field} className="mb-2">
              <dt className="font-semibold">{importFields[field]}</dt>
              <dd className="whitespace-pre-wrap">{value || "(prazno)"}</dd>
              {row.before && field !== "siteCode" && field !== "systemCode" && (
                <dd>Trenutno: {String(row.before[field] || "(prazno)")}</dd>
              )}
            </div>
          ),
        )}
      </dl>
    </article>
  );
}
export function ImportMappingForm({
  detail,
  operationId,
}: {
  detail: ImportDetail;
  operationId: string;
}) {
  const [mapping, setMapping] = useState(
    detail.preview?.mapping ?? suggestMapping(detail.grid.headers),
  );
  const [resolutions, setResolutions] = useState(
    detail.preview?.resolutions ?? {},
  );
  const [operation, setOperation] = useState(operationId);
  const [state, action, pending] = useActionState(
    async (previous: ImportState, form: FormData) => {
      const result = await previewImport(previous, form);
      // Rotate only after an acknowledged success; uncertain retries keep their exact ID.
      if (result.success) setOperation(crypto.randomUUID());
      return result;
    },
    initial,
  );
  const changed = () => {
    setOperation(crypto.randomUUID());
  };
  const preview = detail.preview;
  const reviewed =
    preview &&
    Object.keys(importFields).every(
      (field) =>
        mapping[field as ImportField] === preview.mapping[field as ImportField],
    ) &&
    JSON.stringify(
      Object.entries(resolutions)
        .sort()
        .map(([row, choice]) => [row, Object.entries(choice).sort()]),
    ) ===
      JSON.stringify(
        Object.entries(preview.resolutions)
          .sort()
          .map(([row, choice]) => [row, Object.entries(choice).sort()]),
      );
  if (detail.application)
    return (
      <>
        <ImportApplicationResult application={detail.application} />
        <details className="my-5">
          <summary>Prikaži primenjeni pregled</summary>
          <p>
            Ovo su vrednosti pregledane pre primene. Rezultat upisa je prikazan
            iznad.
          </p>
          {preview?.rows.map((row) => (
            <RowResult key={row.number} row={row} />
          ))}
        </details>
        <Link href="/imports">Učitaj novi fajl</Link>
      </>
    );
  return (
    <>
      <form action={action} onReset={(e) => e.preventDefault()}>
        <input type="hidden" name="batchId" value={detail.id} />
        <input type="hidden" name="operationId" value={operation} />
        <fieldset disabled={pending} className="card my-5 space-y-4">
          <legend>Mapiranje kolona</legend>
          <p>
            Oznake lokacije i sistema određuju identitet. Uvoz koristi postojeće
            lokacije. Za nove sisteme povežite i prostoriju.
          </p>
          <p>
            Polja bez izabrane kolone ostaju nepromenjena. Prazna povezana
            opciona polja predlažu brisanje vrednosti. Komponente se ovim uvozom
            ne menjaju.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.entries(importFields) as [ImportField, string][]).map(
              ([field, label]) => (
                <SelectField
                  key={field}
                  label={`${label}${["siteCode", "systemCode"].includes(field) ? " *" : ""}`}
                  name={field}
                  required={["siteCode", "systemCode"].includes(field)}
                  value={mapping[field] ?? ""}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value === "") delete next[field];
                    else next[field] = Number(e.target.value);
                    setMapping(next);
                    changed();
                  }}
                >
                  <option value="">Ne koristi kolonu</option>
                  {detail.grid.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </SelectField>
              ),
            )}
          </div>
          {preview?.rows
            .filter((row) => row.sites.length > 1 || row.systems.length > 1)
            .map((row) => (
              <fieldset key={row.number} className="mt-5">
                <legend>Razreši red {row.number}</legend>
                {(
                  [
                    ["siteId", row.sites, "Lokacija"],
                    ["systemId", row.systems, "Sistem"],
                  ] as const
                )
                  .filter(([, choices]) => choices.length > 1)
                  .map(([field, choices, label]) => (
                    <SelectField
                      key={field}
                      label={`${label} za red ${row.number}`}
                      name={`resolve:${row.number}:${field}`}
                      value={resolutions[row.number]?.[field] ?? ""}
                      onChange={(e) => {
                        const next = { ...resolutions };
                        const selection = { ...next[row.number] };
                        if (e.target.value) selection[field] = e.target.value;
                        else delete selection[field];
                        if (field === "siteId") delete selection.systemId;
                        if (Object.keys(selection).length)
                          next[row.number] = selection;
                        else delete next[row.number];
                        setResolutions(next);
                        changed();
                      }}
                    >
                      <option value="">Izaberite zapis</option>
                      {choices.map((choice) => (
                        <option value={choice.id} key={choice.id}>
                          {choice.label} · {choice.id.slice(0, 8)}
                        </option>
                      ))}
                    </SelectField>
                  ))}
              </fieldset>
            ))}
          {/* Keep previously reviewed resolutions even when a new mapping removes ambiguity controls. */}
          {Object.entries(resolutions).flatMap(([number, choice]) =>
            Object.entries(choice).map(([field, id]) =>
              preview?.rows.some(
                (row) =>
                  String(row.number) === number &&
                  (field === "siteId" ? row.sites : row.systems).length > 1,
              ) ? null : (
                <input
                  key={`${number}:${field}`}
                  type="hidden"
                  name={`resolve:${number}:${field}`}
                  value={id}
                />
              ),
            ),
          )}
          <button className="button primary mt-5" disabled={pending}>
            {pending ? "Provera redova…" : "Pregledaj mapiranje"}
          </button>
          {state.message && <p role="status">{state.message}</p>}
        </fieldset>
      </form>
      <section className="card my-5 min-w-0">
        <h2>Učitani podaci · broj redova: {detail.grid.rows.length}</h2>
        <p>Prvih pet redova za proveru kolona:</p>
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Primer podataka iz fajla"
        >
          <table>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">Red</th>
                {detail.grid.headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.grid.rows.slice(0, 5).map((row) => (
                <tr key={row.number}>
                  <td className="px-3 py-2 align-top">{row.number}</td>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className="max-w-48 break-words px-3 py-2 align-top"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {preview && (
        <section aria-label="Sačuvani pregled">
          <h2>Rezultat pregleda</h2>
          {!reviewed && (
            <p role="status">
              Mapiranje ili izbor su promenjeni. Ponovite pregled; ispod je
              poslednji sačuvani rezultat.
            </p>
          )}
          <p>
            Novi sistemi:{" "}
            {preview.rows.filter((r) => r.action === "new").length} · Pronađeni:{" "}
            {preview.rows.filter((r) => r.action === "matched").length} · Sa
            greškama: {preview.rows.filter((r) => r.action === "error").length}
          </p>
          <p>
            Registar nije promenjen. Za ispravku sadržaja{" "}
            <Link href="/imports">
              učitajte ispravljen fajl kao novi pregled
            </Link>
            .
          </p>
          <details className="mb-5 break-all">
            <summary>Identifikator sačuvanog pregleda</summary>
            <p>{preview.digest}</p>
          </details>
          {preview.rows.map((row) => (
            <RowResult row={row} key={row.number} />
          ))}
          {reviewed && preview.rows.every((row) => row.action !== "error") ? (
            <ImportApplyForm
              key={`${preview.id}:${preview.digest}`}
              batchId={detail.id}
              preview={preview}
              operationId={operationId}
            />
          ) : (
            <p>
              Pre primene ispravite sve greške i sačuvajte pregled trenutnog
              mapiranja.
            </p>
          )}
        </section>
      )}
    </>
  );
}
