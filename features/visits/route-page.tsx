import { Suspense } from "react";
import { AuthLoading } from "@/features/auth/auth-screen";
import { StaffPage } from "@/features/workspaces/staff-shell";
import { CustomerPreview, VisitWorkspace } from "./pages";

type Props = {
  params: Promise<{ visitId: string }>;
  view?: "field" | "review" | "preview";
};
async function ResolvedVisit({ params, view = "field" }: Props) {
  const { visitId } = await params;
  const suffix = view === "field" ? "" : `/${view}`;
  return (
    <StaffPage
      path={`/visits/${visitId}${suffix}`}
      roles={view === "field" ? undefined : ["owner", "coordinator"]}
    >
      {() =>
        view === "preview" ? (
          <CustomerPreview id={visitId} />
        ) : (
          <VisitWorkspace id={visitId} office={view === "review"} />
        )
      }
    </StaffPage>
  );
}
export function VisitRoute(props: Props) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ResolvedVisit {...props} />
    </Suspense>
  );
}
