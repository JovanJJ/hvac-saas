import { Suspense } from "react";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { AuthLoading } from "@/features/auth/auth-screen";
import { BillingDetailPage } from "@/features/handover/pages";
async function Content({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return <StaffPage path={`/office/handover/${visitId}`} roles={["owner", "coordinator"]}>{() => <BillingDetailPage id={visitId} />}</StaffPage>;
}
export default function Page(props: { params: Promise<{ visitId: string }> }) {
  return <Suspense fallback={<AuthLoading />}><Content {...props} /></Suspense>;
}

export const metadata = { title: "Provera naplate" };
