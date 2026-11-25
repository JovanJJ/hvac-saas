import { StaffPage } from "@/features/workspaces/staff-shell";
import { NewPlanContent, type PlanSearch } from "@/features/maintenance/pages";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<PlanSearch>;
}) {
  return (
    <StaffPage path="/maintenance/new" roles={["owner", "coordinator"]}>
      {() => <NewPlanContent searchParams={searchParams} />}
    </StaffPage>
  );
}

export const metadata = { title: "Novi plan održavanja" };
