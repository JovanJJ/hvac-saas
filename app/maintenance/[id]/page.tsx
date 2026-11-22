import { StaffPage } from "@/features/workspaces/staff-shell";
import { PlanContent } from "@/features/maintenance/pages";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StaffPage path="/maintenance" roles={["owner", "coordinator"]}>
      {() => <PlanContent params={params} />}
    </StaffPage>
  );
}
