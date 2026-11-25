import { StaffPageHeading } from "@/components/ui/staff-page-heading";
import { OfflineDeviceStatus } from "@/features/offline/device-status";
import { requireWorkspace } from "@/features/workspaces/dal";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { operationSnapshot } from "@/features/operations/dal";
import { VisitList } from "@/features/operations/visit-list";
async function TodayContent() {
  const data = await operationSnapshot();
  const context = await requireWorkspace();
  const now = new Date();
  const visits = data.visits.filter(v => v.assigned && new Date(v.start).toLocaleDateString("en-CA", { timeZone: v.timeZone }) === now.toLocaleDateString("en-CA", { timeZone: v.timeZone }));
  return (
    <>
      <StaffPageHeading title="Danas" description="Vaše dodeljene posete. Pre polaska preuzmite posetu za rad bez interneta." action={<a href="/offline/v2/index.html" className="button secondary">Preuzete posete na ovom telefonu</a>} />
      <p>Posete za danas: {visits.length}</p>
      <OfflineDeviceStatus
        userId={context.user.id}
        organizationId={context.workspace.organization.id}
      />
      <VisitList
        offlineScope={{
          userId: context.user.id,
          organizationId: context.workspace.organization.id,
        }}
        visits={visits}
      />
    </>
  );
}
export default function Page() {
  return <StaffPage path="/today">{() => <TodayContent />}</StaffPage>;
}
