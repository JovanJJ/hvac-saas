import { StaffPage } from "@/features/workspaces/staff-shell";
import { RegisterContent } from "@/features/operations/pages";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  return (
    <StaffPage path="/sites" roles={["owner", "coordinator"]}>
      {() => <RegisterContent kind="site" selection={searchParams} />}
    </StaffPage>
  );
}

export const metadata = { title: "Lokacije" };
