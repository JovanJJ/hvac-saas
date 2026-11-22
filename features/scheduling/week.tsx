import Link from "next/link";
import { VisitList } from "@/features/operations/visit-list";
import { localInput, scheduleLink, shiftDate, type readFilters, type ScheduleVisit } from "./model";

export function ScheduleWeek({ visits, filters }: {
  visits: ScheduleVisit[];
  filters: ReturnType<typeof readFilters>;
}) {
  return (
    <section aria-label="Nedeljni raspored" className="grid min-w-0 gap-5 lg:grid-cols-2">
      {Array.from({ length: 7 }, (_, index) => {
        const date = shiftDate(filters.from, index);
        const daily = visits.filter(visit => localInput(visit.start, visit.timeZone).slice(0, 10) === date);
        const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("sr-Latn-RS", {
          timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        return (
          <section key={date} aria-label={label} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <h2><Link href={scheduleLink({ ...filters, view: "day" }, date)}>{label}</Link></h2>
            <p>Broj poseta: {daily.length}</p>
            <VisitList visits={daily} manageSchedule />
          </section>
        );
      })}
    </section>
  );
}
