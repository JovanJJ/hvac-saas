import { StaffPage } from "@/features/workspaces/staff-shell";
import { operationSnapshot } from "@/features/operations/dal";
import { VisitList } from "@/features/operations/visit-list";
async function TodayContent() {
  const data = await operationSnapshot();
  const now = new Date();
  return (
    <>
      <h1>Danas</h1>
      <VisitList
        visits={data.visits.filter(
          (v) =>
            v.assigned &&
            new Date(v.start).toLocaleDateString("en-CA", {
              timeZone: v.timeZone,
            }) === now.toLocaleDateString("en-CA", { timeZone: v.timeZone }),
        )}
      />
    </>
  );
}
export default function Page() {
  return <StaffPage path="/today">{() => <TodayContent />}</StaffPage>;
}
