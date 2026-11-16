import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/features/workspaces/dal";
import type { Snapshot } from "./types";
export async function operationSnapshot() {
  const context = await requireWorkspace();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("operation_snapshot", {
    p_organization_id: context.workspace.organization.id,
  });
  if (error) throw new Error("Podaci trenutno nisu dostupni.");
  return data as unknown as Snapshot;
}
