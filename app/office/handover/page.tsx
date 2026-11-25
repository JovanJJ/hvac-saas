import { StaffPage } from "@/features/workspaces/staff-shell";
import { HandoverQueues } from "@/features/handover/pages";
import type { SearchParams } from "@/features/handover/model";
export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <StaffPage path="/office/handover" roles={["owner", "coordinator"]}>{() => <HandoverQueues searchParams={searchParams} />}</StaffPage>;
}

export const metadata = { title: "Potvrde i naplata" };
