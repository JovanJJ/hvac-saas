import { StaffPage } from "@/features/workspaces/staff-shell";
import { ScheduleBoard } from "@/features/scheduling/pages";
import type { SearchParams } from "@/features/scheduling/model";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <StaffPage path="/schedule" roles={["owner", "coordinator"]}>
      {() => <ScheduleBoard searchParams={searchParams} />}
    </StaffPage>
  );
}
