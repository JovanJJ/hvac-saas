import { StaffPage } from "@/features/workspaces/staff-shell";
import { RegisterContent } from "@/features/operations/pages";
export default function Page() {
  return (
    <StaffPage path="/customers" roles={["owner", "coordinator"]}>
      {() => <RegisterContent kind="customer" />}
    </StaffPage>
  );
}

export const metadata = { title: "Klijenti" };
