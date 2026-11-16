import { StaffPage } from "@/features/workspaces/staff-shell";
import { ScheduleContent } from "@/features/operations/pages";
export default function Page() {
  return (
    <StaffPage path="/schedule" roles={["owner", "coordinator"]}>
      {() => <ScheduleContent />}
    </StaffPage>
  );
}
