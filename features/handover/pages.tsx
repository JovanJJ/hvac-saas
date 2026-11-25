import { OfficeEmpty, OfficeFacts } from "@/components/ui/office-work";
import { StaffPageHeading } from "@/components/ui/staff-page-heading";
import { OverviewError } from "@/features/office/overview-state";
import { requireWorkspace } from "@/features/workspaces/dal";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { SelectField } from "@/components/ui/select-field";
import { visitStatusLabels } from "@/features/visits/model";
import { ReceiptRefresh } from "@/features/reports/receipt-refresh";
import { renderLabels } from "@/features/reports/status-labels";
import { billingDetail, handoverQueue } from "./dal";
import { BillingForm } from "./form";
import { billingLabels, receiptLabels, readFilters, handoverLink, type BillingValue, type HandoverRow, type SearchParams } from "./model";
function BillingState({ value }: { value: BillingValue }) {
  return <>
    <p className="office-state">Oznaka: {value.stale ? billingLabels.recheck : value.ready ? billingLabels.ready : "Nije označeno kao spremno"}</p>
    {value.stale && <p>Podaci posete su promenjeni nakon označavanja. Potrebna je ponovna provera.</p>}
    {value.actor && <p>Poslednja promena: {value.actor}</p>}
    {value.note && <p>Interna beleška: {value.note}</p>}
  </>;
}
function HandoverCard({ row, receipts }: { row: HandoverRow; receipts: boolean }) {
  return <article className="card my-5 min-w-0 break-words">
    <h2>{row.site}</h2><p>{row.customer}</p>
    <p>{new Date(row.at).toLocaleString("sr-Latn-RS", { timeZone: row.timeZone })} · {row.timeZone}</p>
    {receipts ? <>
      <p>{row.number} · Revizija {row.revision} · {row.latest ? "Najnovija revizija" : "Prethodna revizija"}</p>
      <p className="office-state">{row.receiptCount ? "Prijem potvrđen" : "Bez potvrde prijema"} · Broj potvrda: {row.receiptCount}</p>
      <p>{row.renderState && renderLabels[row.renderState]} · Aktivni linkovi: {row.activeLinks}</p>
      <Link href={`/office/reports/${row.revisionId}`}>Otvori izveštaj i potvrde</Link>
    </> : <>
      <p>Stanje posete: {visitStatusLabels[row.visitStatus]}</p>
      <BillingState value={row.billing!} />
      <Link href={`/office/handover/${row.visitId}`}>Proveri pripremu naplate</Link>
    </>}
    <p><Link href={`/visits/${row.visitId}/review`}>Pregledaj terenski rad</Link></p>
  </article>;
}
export async function HandoverQueues({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { filters, invalid } = readFilters(await searchParams);
  await requireWorkspace(["owner", "coordinator"]);
  let data: Awaited<ReturnType<typeof handoverQueue>>;
  try { data = await handoverQueue(filters); }
  catch { return <><StaffPageHeading title="Potvrde i naplata" description="Potvrde prijema i interna provera naplate vode se odvojeno." /><OverviewError label="Potvrde i naplata" /></>; }
  const receipts = filters.queue === "receipts";
  const states = receipts ? receiptLabels : billingLabels;
  return <>
    <StaffPageHeading title="Potvrde i naplata" description="Potvrda prijema pripada reviziji izveštaja. Spremnost za proveru naplate pripada poseti." />
    <nav aria-label="Pregledi primopredaje" className="my-5 flex flex-wrap gap-3">
      <Link className={`button ${receipts ? "primary" : "secondary"}`} href={handoverLink(filters, { queue: "receipts", state: "missing", page: 1 })} aria-current={receipts ? "page" : undefined}>Potvrde prijema</Link>
      <Link className={`button ${receipts ? "secondary" : "primary"}`} href={handoverLink(filters, { queue: "billing", state: "pending", page: 1 })} aria-current={!receipts ? "page" : undefined}>Provera naplate</Link>
    </nav>
    <p>{receipts ? "Potvrda se odnosi na tačnu reviziju izveštaja. Prijem jedne revizije ne potvrđuje novu ispravku." : "Oznaka je interna priprema za proveru naplate. Ne potvrđuje prijem, završetak radnji, odobrenje ponude ili izdavanje fakture."}</p>
    <p>Datumi filtriraju {receipts ? "datum izdavanja izveštaja" : "datum posete"} u zoni lokacije.</p>
    <ReceiptRefresh label="Osveži pregled" />
    {invalid && <p role="alert">Neispravni filteri su vraćeni na početni prikaz.</p>}
    <form key={JSON.stringify(filters)} method="get" action="/office/handover" aria-label="Filteri primopredaje" className="card my-5 space-y-4">
      <input type="hidden" name="queue" value={filters.queue} />
      <div className="form-grid">
        <SelectField label="Klijent" name="customer" defaultValue={filters.customer}><option value="">Svi klijenti</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        <SelectField label="Lokacija" name="site" defaultValue={filters.site}><option value="">Sve lokacije</option>{data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
        <SelectField label="Stanje pregleda" name="state" defaultValue={filters.state}>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        {receipts && <SelectField label="Revizije" name="revision" defaultValue={filters.revision}><option value="all">Sve revizije</option><option value="latest">Samo najnovije</option></SelectField>}
        <label>Od datuma<input type="date" name="from" defaultValue={filters.from} /></label>
        <label>Do datuma<input type="date" name="until" defaultValue={filters.until} /></label>
      </div>
      <button className="button primary">Prikaži primopredaju</button>
      <Link className="button secondary" href={handoverLink(filters, { state: receipts ? "missing" : "pending", site: "", customer: "", from: "", until: "", revision: "all", page: 1 })}>Poništi filtere</Link>
    </form>
    <p>Ukupno: {data.total} · Stranica {data.page}</p>
    {!data.rows.length && <OfficeEmpty href={handoverLink(filters, { state: "all", site: "", customer: "", from: "", until: "", revision: "all", page: 1 })} label="Prikaži sve stavke">Nema stavki za izabrane filtere.</OfficeEmpty>}
    {data.rows.map(row => <HandoverCard key={row.id} row={row} receipts={receipts} />)}
    <nav aria-label="Stranice primopredaje" className="my-5 flex flex-wrap gap-3">
      {data.page > 1 && <Link href={handoverLink(filters, { page: data.page - 1 })}>Prethodna stranica</Link>}
      {data.page < 10000 && data.page * 30 < data.total && <Link href={handoverLink(filters, { page: data.page + 1 })}>Sledeća stranica</Link>}
    </nav>
  </>;
}
export async function BillingDetailPage({ id }: { id: string }) {
  const detail = await billingDetail(id);
  const eligible = ["submitted", "issued"].includes(detail.status);
  return <div className="min-w-0 break-words">
    <Link href="/office/handover?queue=billing">Nazad na proveru naplate</Link>
    <StaffPageHeading title={`Provera naplate · ${detail.site}`} description="Interna priprema za naplatu; potvrde prijema i radnje proveravaju se zasebno." />
    <OfficeFacts items={[{ label: "Klijent", value: detail.customer }, { label: "Stanje posete", value: visitStatusLabels[detail.status] }]} />
    <p>Ova oznaka ne izdaje fakturu i ne zatvara radnje. Potvrda prijema vodi se zasebno.</p>
    <section className="card my-5"><h2>Trenutno stanje pripreme</h2><BillingState value={detail.billing} />
      {detail.billing.updatedAt && <p>{new Date(detail.billing.updatedAt).toLocaleString("sr-Latn-RS", { timeZone: detail.timeZone })} · {detail.timeZone}</p>}
    </section>
    <Link href={`/visits/${id}/review`}>Pregledaj terenski rad</Link>
    {detail.revisionId && <p><Link href={`/office/reports/${detail.revisionId}`}>Otvori najnoviji izveštaj i potvrde</Link></p>}
    {eligible ? <BillingForm key={id} detail={detail} operationId={randomUUID()} /> : <p>Oznaka se može menjati samo za predate ili izdate posete.</p>}
    <section aria-label="Istorija provere naplate" className="my-5 space-y-4">
      <h2>Istorija provere naplate</h2><p>Poslednjih 20 promena.</p>
      {!detail.history.length && <p>Još nema promena oznake.</p>}
      {detail.history.map(event => <article key={event.operationId} className="card">
        <p>{event.after.ready ? "Označeno kao spremno" : "Oznaka uklonjena"} · {event.after.actor}</p>
        <p>{new Date(event.at).toLocaleString("sr-Latn-RS", { timeZone: detail.timeZone })} · {detail.timeZone}</p>
        <p>{event.after.note}</p>
      </article>)}
    </section>
  </div>;
}
