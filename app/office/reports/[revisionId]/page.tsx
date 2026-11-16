import { Suspense } from "react";
import { AuthLoading } from "@/features/auth/auth-screen";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { RevisionPage } from "@/features/reports/pages";
async function Content({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  const { revisionId } = await params;
  return (
    <StaffPage
      path={`/office/reports/${revisionId}`}
      roles={["owner", "coordinator"]}
    >
      {() => <RevisionPage id={revisionId} />}
    </StaffPage>
  );
}
export default function Page(props: {
  params: Promise<{ revisionId: string }>;
}) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
