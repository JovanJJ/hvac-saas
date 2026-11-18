import "server-only";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FollowUp, ReturnSource } from "./model";
export async function followUps() {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("follow_up_list", {
    p_organization_id: context.workspace.organization.id,
  });
  if (error) throw new Error("Radnje trenutno nisu dostupne.");
  return { context, actions: data as FollowUp[] };
}
export async function returnSource(organizationId: string, visitId: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("return_visit_source", {
    p_organization_id: organizationId,
    p_visit_id: visitId,
  });
  if (error) throw new Error("Izvorni nalaz trenutno nije dostupan.");
  return data as ReturnSource | null;
}
