import Link from "next/link";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { ReviewQueue } from "@/features/visits/pages";
import { RecentReports } from "@/features/reports/pages";
export default function OfficePage() {
  return (
    <StaffPage path="/office" roles={["owner", "coordinator"]}>
      {(context) => (
        <>
          <h1>Kancelarija</h1>
          <ReviewQueue />
          <RecentReports />
          <Link href="/customers" className="button secondary">
            Dodaj klijenta
          </Link>
          <Link href="/visits/new" className="button primary">
            Zakaži posetu
          </Link>
          <div className="card mt-6">
            <h2>Planiranje servisnih poseta</h2>
            <p>Dodajte klijenta, lokaciju i sisteme, zatim zakažite posetu.</p>
            {context.workspace.role === "owner" && (
              <Link href="/settings/team" className="button primary mt-5">
                Pozovi člana tima
              </Link>
            )}
            <Link href="/today" className="button secondary mt-5 sm:ml-3">
              Nastavi samostalno
            </Link>
          </div>
        </>
      )}
    </StaffPage>
  );
}
