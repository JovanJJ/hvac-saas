import { StaffPage } from "@/features/workspaces/staff-shell";
import { FollowUpList } from "@/features/follow-ups/pages";
export default function Page() {
  return (
    <StaffPage path="/office/actions" roles={["owner", "coordinator"]}>
      {() => <FollowUpList />}
    </StaffPage>
  );
}
