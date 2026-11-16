import { Suspense } from "react";
import { redirect } from "next/navigation";
import { landingPath } from "@/features/workspaces/dal";
import { AuthLoading } from "@/features/auth/auth-screen";
async function AccountLanding() {
  return redirect(await landingPath());
}
export default function Home() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AccountLanding />
    </Suspense>
  );
}
