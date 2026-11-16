import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VisitBundle } from "./model";
export async function visitBundle(id: string, office = false) {
  const context = await requireWorkspace(
    office ? ["owner", "coordinator"] : undefined,
  );
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("visit_bundle", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: id,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Poseta trenutno nije dostupna.");
  const visit = data as unknown as VisitBundle;
  visit.items = visit.items.map((i) => ({
    ...i,
    followUp: i.followUp && {
      ...i.followUp,
      ownerId: i.followUp.ownerId ?? "",
      dueDate: i.followUp.dueDate ?? "",
    },
  }));
  return { context, visit };
}
export async function reviewQueue() {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("visit_review_queue", {
    p_organization_id: context.workspace.organization.id,
  });
  if (error) throw new Error("Pregled trenutno nije dostupan.");
  return data as unknown as { id: string; site: string; submittedAt: string }[];
}
