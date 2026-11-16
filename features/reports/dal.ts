import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportPreview, ReportRevision, ReportListEntry } from "./model";
export async function reportPreview(visitId: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.string().uuid().safeParse(visitId).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("report_preview", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: visitId,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Pregled izveštaja trenutno nije dostupan.");
  return data as unknown as ReportPreview;
}
export async function reportRevision(revisionId: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.string().uuid().safeParse(revisionId).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("report_revision", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: revisionId,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Izveštaj trenutno nije dostupan.");
  return data as unknown as ReportRevision;
}
export async function reportList() {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("report_list", {
    p_organization_id: context.workspace.organization.id,
  });
  if (error) throw new Error("Izveštaji trenutno nisu dostupni.");
  return data as unknown as ReportListEntry[];
}
