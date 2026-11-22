import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImportDetail } from "./model";
export async function importDetail(id: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("import_detail", {
    p_organization_id: context.workspace.organization.id,
    p_batch_id: id,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Pregled uvoza trenutno nije dostupan.");
  return data as unknown as ImportDetail;
}
