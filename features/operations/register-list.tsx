"use client";
import Link from "next/link";
import { useState } from "react";
import type { RegisterRow } from "./types";
export function RegisterList({
  rows,
  sites,
  customers,
  kind,
}: {
  kind: "customer" | "site" | "system";
  rows: RegisterRow[];
  sites: RegisterRow[];
  customers: RegisterRow[];
}) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const filtered = rows.filter(
    (row) =>
      (archived || !row.archived_at) &&
      Object.values(row)
        .join(" ")
        .toLocaleLowerCase("sr-Latn")
        .includes(query.toLocaleLowerCase("sr-Latn")),
  );
  return (
    <section className="mt-6 grid gap-3" aria-label="Sačuvani zapisi">
      <label>
        Pretraga po nazivu, oznaci, prostoriji ili serijskom broju
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="flex items-center gap-3">
        <input
          className="w-5"
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Prikaži arhivirane zapise
      </label>
      {!filtered.length && <p>Nema pronađenih zapisa.</p>}
      {filtered.map((row) => (
        <article key={row.id} className="card">
          <h2>
            {row.code} {row.name ?? row.room}
          </h2>
          <Link
            className="underline"
            href={`/${kind === "customer" ? "customers" : kind === "site" ? "sites" : "systems"}/${row.id}`}
          >
            Otvori detalje
          </Link>
          {row.archived_at && <p>Arhivirano</p>}
          {row.site_id && (
            <p>
              Lokacija: {sites.find((site) => site.id === row.site_id)?.name}
            </p>
          )}
          {row.customer_id && (
            <p>
              Klijent:{" "}
              {
                customers.find((customer) => customer.id === row.customer_id)
                  ?.name
              }
            </p>
          )}
          <p>{row.address ?? row.contact ?? row.model}</p>
          {row.serial && <p>Serijski broj: {row.serial}</p>}
        </article>
      ))}
    </section>
  );
}
