"use client";
import { useId, useState } from "react";
import type { RegisterRow } from "./types";
import { RegisterCard } from "@/features/equipment/register-ui";

export function RegisterList({ rows, sites, customers, kind, initialParentId = "", showParentFilter = true }: {
  kind: "customer" | "site" | "system"; rows: RegisterRow[]; sites: RegisterRow[]; customers: RegisterRow[];
  initialParentId?: string; showParentFilter?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [parentId, setParentId] = useState(initialParentId);
  const id = useId();
  const parents = kind === "site" ? customers : sites;
  const filtered = rows.filter(row => {
    const parent = parents.find(item => item.id === (kind === "site" ? row.customer_id : row.site_id));
    const text = [row.name, row.code, row.room, row.serial, row.model, row.manufacturer, row.address, row.contact, ...(row.unit_serials ?? []), parent?.name, parent?.code].filter(Boolean).join(" ").toLocaleLowerCase("sr-Latn");
    return (archived || !row.archived_at) && (!parentId || (kind === "site" ? row.customer_id : row.site_id) === parentId) && text.includes(query.trim().toLocaleLowerCase("sr-Latn"));
  });
  return <section className="mt-6 min-w-0 space-y-4" aria-label="Sačuvani zapisi">
    <div className="grid min-w-0 items-end gap-4 md:grid-cols-2">
      <div className="min-w-0"><label htmlFor={`${id}-search`}>Pretraga po nazivu, oznaci, prostoriji ili serijskom broju</label>
        <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      {kind !== "customer" && showParentFilter && <div className="min-w-0"><label htmlFor={`${id}-parent`}>{kind === "site" ? "Klijent za pregled" : "Lokacija za pregled"}</label>
        <select id={`${id}-parent`} value={parentId} onChange={event => setParentId(event.target.value)}>
          <option value="">{kind === "site" ? "Svi klijenti" : "Sve lokacije"}</option>
          {parents.map(parent => <option key={parent.id} value={parent.id}>{[parent.code,parent.name].filter(Boolean).join(" · ")}{parent.archived_at ? " · arhivirano" : ""}</option>)}
        </select>
      </div>}
    </div>
    <label className="flex items-center gap-3"><input className="w-5" type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Prikaži arhivirane zapise</label>
    {kind === "system" && rows.some(row => Array.isArray(row.unit_serials)) && <p className="text-sm text-[#60716c]">Pretraga uključuje i serijske brojeve sačuvanih komponenti.</p>}
    <p role="status" className="text-sm text-[#60716c]">Pronađeno: {filtered.length}</p>
    {!filtered.length && <div className="rounded-xl border border-[#dce4df] bg-white p-5">
      <p>{rows.length ? "Nema pronađenih zapisa." : "Još nema sačuvanih zapisa."}</p>
      {(query || parentId || archived) && <button className="button secondary mt-3" type="button" onClick={() => { setQuery(""); setParentId(""); setArchived(false); }}>Poništi pretragu</button>}
    </div>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">{filtered.map(row => {
      const parent = parents.find(item => item.id === (kind === "site" ? row.customer_id : row.site_id));
      return <RegisterCard key={row.id} row={row} kind={kind} parent={parent?.name} parentHref={parent ? `/${kind === "site" ? "customers" : "sites"}/${parent.id}` : undefined} archivedParent={Boolean(parent?.archived_at)} />;
    })}</div>
  </section>;
}
