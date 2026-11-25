import Link from "next/link";
import type { ReactNode } from "react";
import type { RegisterRow } from "@/features/operations/types";
import type { RegisterKind } from "./model";

export const registerPaths = { customer: "customers", site: "sites", system: "systems" };
export const registerTitles = { customer: "Klijenti", site: "Lokacije", system: "Sistemi" };
export const createLabels = { customer: "Dodaj klijenta", site: "Dodaj lokaciju", system: "Dodaj sistem" };
export function recordTitle(row: RegisterRow) {
  return [row.code, row.name ?? row.room].filter(Boolean).join(" · ");
}
export function RegisterBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav aria-label="Putanja" className="mb-5 text-sm">
    <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-2 p-0">
      {items.map((item, index) => <li key={`${index}-${item.label}`} className="min-w-0 break-words">
        {index > 0 && <span aria-hidden="true" className="mr-2 text-[#60716c]">/</span>}
        {item.href ? <Link className="underline" href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}
export function RegisterSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="my-8 min-w-0 space-y-4">
    <h2 id={id} tabIndex={-1} className="scroll-mt-5">{title}</h2>{children}
  </section>;
}
export function IdentityFields({ items }: { items: { label: string; value: unknown }[] }) {
  return <dl className="m-0 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
    {items.map(item => <div key={item.label} className="min-w-0">
      <dt className="text-sm font-semibold text-[#60716c]">{item.label}</dt>
      <dd className="m-0 break-words">{String(item.value || "Nije uneto")}</dd>
    </div>)}
  </dl>;
}
export function RegisterTools({ owner, siteId }: { owner: boolean; siteId?: string }) {
  return <nav aria-label="Prenos podataka registra" className="flex flex-wrap gap-x-5 gap-y-3 text-sm underline">
    <Link href="/imports">Uvoz CSV / Excel</Link>
    {owner && <Link href={siteId ? `/settings/exports?site=${siteId}` : "/settings/exports"}>Izvoz podataka</Link>}
  </nav>;
}
export function RegisterCard({ row, kind, parent, parentHref, archivedParent }: {
  row: RegisterRow; kind: RegisterKind; parent?: string; parentHref?: string; archivedParent?: boolean;
}) {
  return <article className="rounded-xl border border-[#dce4df] bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className="min-w-0 break-words"><Link className="underline" href={`/${registerPaths[kind]}/${row.id}`}>{recordTitle(row)}</Link></h3>
      <span className="rounded-full bg-[#e6f0eb] px-3 py-1 text-xs font-semibold">{row.archived_at ? "Arhivirano" : "Aktivan zapis"}</span>
    </div>
    {parent && <p className="break-words text-sm text-[#60716c]">{kind === "site" ? "Klijent" : "Lokacija"}: {parentHref ? <Link className="underline" href={parentHref}>{parent}</Link> : parent}</p>}
    {archivedParent && <p className="text-sm">Nadređeni zapis je arhiviran.</p>}
    <p className="break-words">{row.address || row.contact || row.model || (kind === "system" ? "Model nije unet" : "Kontakt nije unet")}</p>
    {row.serial && <p className="break-words text-sm">Serijski broj: {row.serial}</p>}
    <Link className="button secondary mt-3" href={`/${registerPaths[kind]}/${row.id}`}>Otvori detalje</Link>
  </article>;
}
