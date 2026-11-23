import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BillingDetail, Filters, QueueData } from "./model";
export async function handoverQueue(filters: Filters) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("handover_queue", { p_organization_id: context.workspace.organization.id, p_filters: filters });
  if (error) throw new Error("Pregled potvrda i naplate trenutno nije dostupan.");
  return data as unknown as QueueData;
}
export async function billingDetail(id: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("billing_review_detail", { p_organization_id: context.workspace.organization.id, p_visit_id: id });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Provera naplate trenutno nije dostupna.");
  return data as unknown as BillingDetail;
}
