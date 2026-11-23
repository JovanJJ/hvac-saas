import "server-only";
import { cache } from "react";
import { currentUser } from "@/features/auth/dal";
import { selectedWorkspace } from "@/features/workspaces/dal";

export type PublicAccountLink = { href: string; label: string };

// React cache deduplicates header/footer reads within one request only.
export const publicAccountLink = cache(async (): Promise<PublicAccountLink | null> => {
  if (!(await currentUser())) return null;
  try {
    const { workspace, workspaces } = await selectedWorkspace();
    if (!workspaces.length) return { href: "/onboarding", label: "Napravi radni prostor" };
    if (!workspace) return { href: "/account", label: "Izaberi firmu" };
    return workspace.role === "technician"
      ? { href: "/today", label: "Danas" }
      : { href: "/office", label: "Kancelarija" };
  } catch {
    // A membership outage must not take the public page down or grant access.
    return { href: "/account", label: "Moj nalog" };
  }
});
