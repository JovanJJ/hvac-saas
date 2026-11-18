import { OfflineDeviceStatus } from "@/features/offline/device-status";
import { requireWorkspace } from "@/features/workspaces/dal";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { operationSnapshot } from "@/features/operations/dal";
import { VisitList } from "@/features/operations/visit-list";
async function TodayContent() {
  const data = await operationSnapshot();
  const context = await requireWorkspace();
  const now = new Date();
  return (
    <>
      <h1>Danas</h1>
      <OfflineDeviceStatus
        userId={context.user.id}
        organizationId={context.workspace.organization.id}
      />
      <p>
        <a href="/offline/v2/index.html">Preuzete posete na ovom telefonu</a>
      </p>
      <VisitList
        offlineScope={{
          userId: context.user.id,
          organizationId: context.workspace.organization.id,
        }}
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
