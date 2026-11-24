import Link from "next/link";
import { scheduleSnapshot } from "@/features/scheduling/dal";
import { VisitList } from "@/features/operations/visit-list";
import { requireWorkspace } from "@/features/workspaces/dal";
import { OverviewError } from "./overview-state";

export function OverviewLoading({ label }: { label: string }) {
  return <p role="status" className="my-5 rounded-xl border border-[#dce4df] bg-white p-5">{label}…</p>;
}

export function FirstSiteGuidance() {
  return <section aria-labelledby="first-site-heading" className="my-5 rounded-xl border border-[#b9c8bc] bg-[#e6f0eb] p-5">
    <h2 id="first-site-heading">Dodajte prvu lokaciju da biste zakazali posetu.</h2>
    <p>Dodajte klijenta, lokaciju i njene sisteme, zatim izaberite termin i dodelite posetu članu tima.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <Link href="/customers" className="button secondary">Dodaj klijenta</Link>
      <Link href="/sites" className="button primary">Dodaj lokaciju</Link>
    </div>
  </section>;
}

export async function OfficeToday() {
  await requireWorkspace(["owner", "coordinator"]);
  let snapshot: Awaited<ReturnType<typeof scheduleSnapshot>>;
  try { snapshot = await scheduleSnapshot({}); }
  catch { return <OverviewError label="Današnji raspored" />; }
  const { visits, sites, filters } = snapshot;
  return <section aria-labelledby="office-today-heading" className="min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="office-today-heading">Današnje posete · {visits.length}</h2>
      <Link href={`/schedule?date=${filters.date}&view=day`} className="underline">Otvori dnevni raspored</Link>
    </div>
    <p className="text-sm text-[#60716c]">{filters.date} · Vremena su u vremenskoj zoni lokacije.</p>
    {!sites.length ? <FirstSiteGuidance /> : !visits.length ? <div className="card my-5">
      <p>Za danas nema zakazanih poseta.</p>
      <Link href={`/schedule?date=${filters.date}&view=week`} className="underline">Pogledaj celu nedelju</Link>
    </div> : <VisitList visits={visits} manageSchedule />}
  </section>;
}
