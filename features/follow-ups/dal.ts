import "server-only";
import { ownerRoster, requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FollowUp, ReturnSource } from "./model";
import type { QueueFilters, WorkQueue } from "./queue-model";
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

export async function workQueue(filters: QueueFilters) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const [result, members] = await Promise.all([
    client.rpc("office_work_queue", {
      p_organization_id: context.workspace.organization.id,
      p_filters: filters,
    }),
    ownerRoster(context.workspace.organization.id),
  ]);
  if (result.error) throw new Error("Pregled obaveza trenutno nije dostupan.");
  return { data: result.data as unknown as WorkQueue, members };
}
