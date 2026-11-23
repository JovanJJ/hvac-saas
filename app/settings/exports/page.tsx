import { z } from "zod";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { requireWorkspace } from "@/features/workspaces/dal";
import { readExport } from "@/features/exports/dal";
import { ExportForm } from "@/features/exports/form";
import type { ExportCatalog } from "@/features/exports/model";
import { SelectField } from "@/components/ui/select-field";
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireWorkspace(["owner"]);
  const query = await searchParams;
  const site = Array.isArray(query.site) ? query.site[0] : query.site;
  const parsed = z.union([z.literal(""), z.uuid()]).safeParse(site || "");
  const { data, error } = await readExport(context.workspace.organization.id, [], parsed.success ? parsed.data : "");
  if (error) return <><h1>Izvoz podataka</h1><p role="alert">Izabrani obuhvat nije dostupan. Osvežite stranicu ili izaberite celu organizaciju.</p><a href="/settings/exports">Prikaži celu organizaciju</a></>;
  const catalog = data as unknown as ExportCatalog;
  const selected = catalog.sites.find(s => s.id === catalog.siteId);
  return <>
    <h1>Izvoz podataka</h1>
    <p>Organizacija: {context.workspace.organization.display_name}</p>
    <p>Obuhvat: {selected ? `${selected.code} · ${selected.name}` : "Cela organizacija"}</p>
    <p>Uključeni su arhivirani zapisi, prethodne komponente i otkazane posete. Svako preuzimanje čita trenutno stanje; izvozi ne menjaju registar ni izveštaje.</p>
    {!parsed.success && <p role="alert">Neispravan izbor lokacije. Prikazana je cela organizacija.</p>}
    <form method="get" action="/settings/exports" className="card my-5 space-y-4" aria-label="Obuhvat izvoza">
      <SelectField name="site" label="Lokacija za izvoz" defaultValue={catalog.siteId || ""}>
        <option value="">Cela organizacija</option>
        {catalog.sites.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}{s.archived ? " · arhivirano" : ""}</option>)}
      </SelectField>
      <button className="button secondary">Prikaži obuhvat</button>
    </form>
    <ExportForm key={catalog.siteId || "organization"} catalog={catalog} />
    <section className="card my-5 space-y-3">
      <h2>Povezivanje fajlova</h2>
      <p>Koristite ID klijenta, ID lokacije, ID sistema i ID posete. Ista oznaka sistema na dve lokacije ne znači da je to isti sistem. „Sistemi po poseti i nalazi“ povezuje posetu sa sistemima.</p>
      <p>CSV koristi UTF-8, tačku-zarez i datume sa vremenskim pomakom. Pri uvozu u Excel izaberite tekstualni tip za identifikatore i serijske brojeve da biste sačuvali početne nule. Stanja i ishodi su izvorne šifre iz aplikacije.</p>
      <p>Tekst koji može biti protumačen kao formula dobija početni tabulator kao tekstualni prefiks. Izvoz sadrži operativne podatke, a PDF izveštaje preuzimate sa stranice izdate revizije.</p>
    </section>
  </>;
}
export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <StaffPage path="/settings/exports" roles={["owner"]}>{() => <Content {...props} />}</StaffPage>;
}
