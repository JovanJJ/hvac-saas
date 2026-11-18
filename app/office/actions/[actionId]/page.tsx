import { Suspense } from "react";
import { AuthLoading } from "@/features/auth/auth-screen";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { FollowUpDetail } from "@/features/follow-ups/pages";
async function Content({ params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  return (
    <StaffPage
      path={`/office/actions/${actionId}`}
      roles={["owner", "coordinator"]}
    >
      {() => <FollowUpDetail actionId={actionId} />}
    </StaffPage>
  );
}
export default function Page(props: { params: Promise<{ actionId: string }> }) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
