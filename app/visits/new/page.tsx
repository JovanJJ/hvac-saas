import { StaffPage } from "@/features/workspaces/staff-shell";
import { SchedulingContent } from "@/features/operations/pages";
export default function Page() {
  return (
    <StaffPage path="/visits/new" roles={["owner", "coordinator"]}>
      {(context) => <SchedulingContent context={context} />}
    </StaffPage>
  );
}
