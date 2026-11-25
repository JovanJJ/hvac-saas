import { OfficeEmpty, OfficeFacts, OfficeNavigation } from "@/components/ui/office-work";
import { StaffPageHeading } from "@/components/ui/staff-page-heading";
import { OverviewError } from "@/features/office/overview-state";
import { requireWorkspace } from "@/features/workspaces/dal";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  maintenanceDetail,
  maintenanceEditor,
  maintenanceList,
  generationState,
} from "./dal";
import { PlanForm, PlanToggle } from "./form";
import { PlanGeneration } from "./generation";
import { Occurrences } from "./occurrences";
export type PlanSearch = Record<string, string | string[] | undefined>;
const first = (query: PlanSearch, key: string) =>
  Array.isArray(query[key]) ? query[key][0] : query[key];
export async function PlansContent({
  searchParams,
}: {
  searchParams: Promise<PlanSearch>;
}) {
  const query = await searchParams;
  const parsed = z
    .object({
      state: z.enum(["all", "active", "paused"]),
      page: z.coerce.number().int().min(1).max(1000),
    })
    .safeParse({
      state: first(query, "state") || "all",
      page: first(query, "page") || 1,
    });
  const { state, page } = parsed.success
    ? parsed.data
    : { state: "all", page: 1 };
  await requireWorkspace(["owner", "coordinator"]);
  let data: Awaited<ReturnType<typeof maintenanceList>>;
  try { data = await maintenanceList(state, page); }
  catch { return <><StaffPageHeading title="Planovi održavanja" description="Pravila ponavljanja i priprema budućih poseta." /><OverviewError label="Planovi održavanja" /></>; }
  return (
    <>
      <StaffPageHeading title="Planovi održavanja" description="Plan određuje ponavljanje. Tek kreirana poseta ulazi u raspored i postaje dostupna dodeljenom tehničaru." />
      <p>
        Plan čuva pravilo ponavljanja, sisteme i tim. Aktivne planove obrađuje
        worker i priprema posete za narednih 90 dana.
      </p>
      <Link className="button primary my-5" href="/maintenance/new">
        Novi plan održavanja
      </Link>
      {!parsed.success && (
        <p role="status">Neispravni filteri su vraćeni na početni prikaz.</p>
      )}
      <form key={state} method="get" aria-label="Filteri planova" className="card my-5 space-y-4">
        <label htmlFor="plan-state">Stanje plana</label>
        <select id="plan-state" name="state" defaultValue={state}>
          <option value="all">Svi planovi</option>
          <option value="active">Aktivni</option>
          <option value="paused">Pauzirani</option>
        </select>
        <button className="button primary">Prikaži planove</button>
        <Link className="button secondary" href="/maintenance">Poništi filtere</Link>
      </form>
      <p>Ukupno: {data.total}</p>
      {!data.plans.length && <OfficeEmpty href="/maintenance/new" label="Novi plan održavanja">Nema planova za izabrani prikaz. Za promenu prikaza poništite filtere, ili dodajte plan za aktivnu lokaciju.</OfficeEmpty>}
      {data.plans.map((plan) => (
        <article
          className="card my-5 min-w-0 break-words space-y-3"
          key={plan.id}
        >
          <h2>
            <Link href={`/maintenance/${plan.id}`}>{plan.name}</Link>
          </h2>
          <p>
            {plan.enabled ? "Aktivan plan" : "Pauziran plan"} · {plan.siteCode}{" "}
            · {plan.site}
          </p>
          <p>
            Sidro: {plan.anchorDate} {plan.anchorTime} · {plan.timeZone}
          </p>
          <p>
            Interval (meseci): {plan.intervalMonths} · Sistemi:{" "}
            {plan.systemCount}
          </p>
        </article>
      ))}
      <nav aria-label="Stranice planova" className="flex flex-wrap gap-5">
        {page > 1 && (
          <Link href={`/maintenance?state=${state}&page=${page - 1}`}>
            Prethodna stranica
          </Link>
        )}
        {page * 30 < data.total && page < 1000 && (
          <Link href={`/maintenance?state=${state}&page=${page + 1}`}>
            Sledeća stranica
          </Link>
        )}
      </nav>
    </>
  );
}
export async function NewPlanContent({
  searchParams,
}: {
  searchParams: Promise<PlanSearch>;
}) {
  const query = await searchParams;
  const siteId = first(query, "site");
  const options = await maintenanceEditor(siteId);
  return (
    <>
      <Link href="/maintenance">Nazad na planove</Link>
      <h1>Novi plan održavanja</h1>
      <form method="get" className="card my-5 space-y-4">
        <label htmlFor="plan-site">Lokacija plana</label>
        <select id="plan-site" name="site" required defaultValue={siteId || ""}>
          <option value="">Izaberite lokaciju</option>
          {options.sites.map((s) => (
            <option value={s.id} key={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
        <button className="button secondary">Izaberi lokaciju</button>
        <p>
          Prvo izaberite lokaciju, zatim unesite podatke plana. Prikaz obuhvata
          najviše 1000 lokacija i 1000 sistema izabrane lokacije.
        </p>
      </form>
      {!options.sites.length && (
        <p>Prvo dodajte aktivnog klijenta, lokaciju i sisteme kroz registar.</p>
      )}
      {options.site &&
        (options.site.active && options.systems.some((s) => s.active) ? (
          <PlanForm
            key={options.site.id}
            options={options}
            planId={randomUUID()}
            operationId={randomUUID()}
          />
        ) : (
          <p>
            Za novi plan su potrebni aktivna lokacija, klijent i najmanje jedan
            aktivan sistem.
          </p>
        ))}
    </>
  );
}
export async function PlanContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PlanSearch>;
}) {
  const { id } = await params;
  const detail = await maintenanceDetail(id);
  const query = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .safeParse(first(query, "visitsPage") || 1);
  const visitsPage = page.success ? page.data : 1;
  const [options, generation] = await Promise.all([
    maintenanceEditor(detail.siteId),
    generationState(id, visitsPage),
  ]);
  return (
    <>
      <Link href="/maintenance">Nazad na planove</Link>
      <h1 className="break-words">{detail.name}</h1>
      <p>
        {detail.enabled ? "Aktivan plan" : "Pauziran plan"} · verzija{" "}
        {detail.version}
      </p>
      <p>
        <Link href={`/sites/${detail.siteId}`}>{options.site!.name}</Link> ·{" "}
        {detail.timeZone}
      </p>
      {!options.site?.active && (
        <p role="status">
          Lokacija ili klijent su arhivirani. Plan možete pauzirati; pre
          nastavka obnovite podatke registra.
        </p>
      )}
      {options.site?.timeZone !== detail.timeZone && (
        <p role="status">
          Vremenska zona lokacije je promenjena. Sačuvani plan koristi{" "}
          {detail.timeZone}; izmenom plana potvrđujete zonu{" "}
          {options.site?.timeZone}.
        </p>
      )}
      <PlanToggle
        key={`toggle-${detail.version}`}
        detail={detail}
        operationId={randomUUID()}
      />
      <p>Izmena i pauziranje plana ne menjaju niti brišu postojeće posete.</p>
      <OfficeNavigation items={[
        { label: "Priprema i kreirane posete", href: "#plan-generation" },
        { label: "Podešavanja plana", href: "#plan-settings" },
        { label: "Održavanje iz planova", href: `/office/actions?queue=maintenance&site=${detail.siteId}` },
        { label: "Raspored", href: "/schedule?view=week" },
      ]} />
      <OfficeFacts items={[
        { label: "Ponavljanje", value: `Na ${detail.intervalMonths} meseci` },
        { label: "Vremenska zona", value: detail.timeZone },
        { label: "Kreirane posete", value: generation.totalVisits },
      ]} />
      <div id="plan-generation" className="office-section"><PlanGeneration
        plan={detail}
        data={generation}
        operationId={randomUUID()}
        page={visitsPage}
        retryOperations={Object.fromEntries(
          generation.jobs.map((job) => [job.id, randomUUID()]),
        )}
      />
      </div>
      <details className="my-5">
        <summary>Termini sačuvanog plana</summary>
        <Occurrences
          rows={detail.occurrences}
          title="Termini sačuvanog plana"
        />
      </details>
      <div id="plan-settings" className="office-section"><PlanForm
        key={detail.id}
        detail={detail}
        options={options}
        planId={detail.id}
        operationId={randomUUID()}
      /></div>
      <section className="my-5">
        <h2>Istorija plana</h2>
        {detail.history.map((event) => (
          <p key={event.version}>
            {event.version} ·{" "}
            {event.kind === "create"
              ? "Kreiran"
              : event.kind === "edit"
                ? "Izmenjen"
                : event.enabled
                  ? "Nastavljen"
                  : "Pauziran"}{" "}
            · {event.actor} · {new Date(event.at).toISOString()}
          </p>
        ))}
      </section>
    </>
  );
}
