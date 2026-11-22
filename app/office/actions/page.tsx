import { StaffPage } from "@/features/workspaces/staff-shell";
import { WorkQueues } from "@/features/follow-ups/queue";
export default function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <StaffPage path="/office/actions" roles={["owner", "coordinator"]}>
      {() => <WorkQueues searchParams={searchParams} />}
    </StaffPage>
  );
}
