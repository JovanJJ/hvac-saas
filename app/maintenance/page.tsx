import { StaffPage } from "@/features/workspaces/staff-shell";
import { PlansContent, type PlanSearch } from "@/features/maintenance/pages";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<PlanSearch>;
}) {
  return (
    <StaffPage path="/maintenance" roles={["owner", "coordinator"]}>
      {() => <PlansContent searchParams={searchParams} />}
    </StaffPage>
  );
}
