import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Dataset } from "./model";
// Both callers authenticate/select workspace; SQL independently requires live owner membership.
export async function readExport(organizationId: string, datasets: Dataset[], site?: string) {
  const client = await createSupabaseServerClient();
  return client.rpc("owner_export", { p_organization_id: organizationId, p_datasets: datasets, p_site_id: site || undefined });
}
