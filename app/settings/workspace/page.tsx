import { StaffPage } from "@/features/workspaces/staff-shell";
import { WorkspaceForm } from "@/features/workspaces/forms";
export default function WorkspaceSettingsPage() {
  return (
    <StaffPage path="/settings/workspace" roles={["owner"]}>
      {(context) => (
        <>
          <h1>Podaci firme</h1>
          <section className="card mt-6">
            <WorkspaceForm workspace={context.workspace.organization} />
          </section>
        </>
      )}
    </StaffPage>
  );
}
