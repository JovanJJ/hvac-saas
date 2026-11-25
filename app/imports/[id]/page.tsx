import { StaffPage } from "@/features/workspaces/staff-shell";
import { ImportContent } from "@/features/imports/pages";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StaffPage path="/imports" roles={["owner", "coordinator"]}>
      {() => <ImportContent params={params} />}
    </StaffPage>
  );
}

export const metadata = { title: "Pregled uvoza" };
