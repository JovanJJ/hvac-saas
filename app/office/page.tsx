import Link from "next/link";
import { StaffPageHeading } from "@/components/ui/staff-page-heading";
import { Suspense } from "react";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { ReviewQueue } from "@/features/visits/pages";
import { RecentReports } from "@/features/reports/pages";
import { OfficeToday, OverviewLoading } from "@/features/office/overview";

export default function OfficePage() {
  return (
    <StaffPage path="/office" roles={["owner", "coordinator"]}>
      {() => <>
        <StaffPageHeading title="Kancelarija" description="Raspored za danas, nalazi za pregled i izdati izveštaji."
          action={<Link href="/visits/new" className="button primary">Zakaži posetu</Link>} />
        <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Suspense fallback={<OverviewLoading label="Učitavanje današnjih poseta" />}><OfficeToday /></Suspense>
          <div className="min-w-0">
            <Suspense fallback={<OverviewLoading label="Učitavanje naloga za pregled" />}><ReviewQueue /></Suspense>
            <Link href="/office/actions" className="button secondary">Sledeće radnje</Link>
            <Link href="/office/handover" className="mt-3 block underline">Potvrde prijema i provera naplate</Link>
          </div>
        </div>
        <Suspense fallback={<OverviewLoading label="Učitavanje izveštaja" />}><RecentReports /></Suspense>
      </>}
    </StaffPage>
  );
}
