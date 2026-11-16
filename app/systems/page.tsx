import { StaffPage } from "@/features/workspaces/staff-shell";
import { RegisterContent } from "@/features/operations/pages";
export default function Page() {
  return (
    <StaffPage path="/systems" roles={["owner", "coordinator"]}>
      {() => <RegisterContent kind="system" />}
    </StaffPage>
  );
}
