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

export async function applyReviewedImport(
  organizationId: string,
  input: {
    batchId: string;
    previewId: string;
    digest: string;
    operationId: string;
  },
) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (context.workspace.organization.id !== organizationId) notFound();
  const client = await createSupabaseServerClient();
  return client.rpc("import_apply", {
    p_organization_id: organizationId,
    p_batch_id: input.batchId,
    p_preview_id: input.previewId,
    p_digest: input.digest,
    p_operation_id: input.operationId,
    p_confirmed: true,
  });
}
