import { StaffPage } from "@/features/workspaces/staff-shell";
import { ImportStart } from "@/features/imports/pages";
export default function Page() {
  return (
    <StaffPage path="/imports" roles={["owner", "coordinator"]}>
      {() => <ImportStart />}
    </StaffPage>
  );
}

export const metadata = { title: "Uvoz opreme" };
