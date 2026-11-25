import { StaffPage } from "@/features/workspaces/staff-shell";
import { PlanContent, type PlanSearch } from "@/features/maintenance/pages";
export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PlanSearch>;
}) {
  return (
    <StaffPage path="/maintenance" roles={["owner", "coordinator"]}>
      {() => <PlanContent params={params} searchParams={searchParams} />}
    </StaffPage>
  );
}

export const metadata = { title: "Plan održavanja" };
