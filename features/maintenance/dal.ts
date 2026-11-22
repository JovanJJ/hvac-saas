import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, ownerRoster } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EditorOptions, PlanDetail, PlanList } from "./model";
export async function maintenanceList(state: string, page: number) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("maintenance_list", {
    p_organization_id: context.workspace.organization.id,
    p_state: state,
    p_page: page,
  });
  if (error) throw new Error("Planovi održavanja trenutno nisu dostupni.");
  return data as unknown as PlanList;
}
export async function maintenanceDetail(id: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("maintenance_detail", {
    p_organization_id: context.workspace.organization.id,
    p_plan_id: id,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Plan trenutno nije dostupan.");
  return data as unknown as PlanDetail;
}
export async function maintenanceEditor(siteId?: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (siteId && !z.uuid().safeParse(siteId).success) notFound();
  const client = await createSupabaseServerClient();
  const [result, staff] = await Promise.all([
    client.rpc("maintenance_editor", {
      p_organization_id: context.workspace.organization.id,
      p_site_id: siteId,
    }),
    ownerRoster(context.workspace.organization.id),
  ]);
  if (result.error?.code === "42501") notFound();
  if (result.error) throw new Error("Izbor lokacija i sistema nije dostupan.");
  const options = result.data as unknown as Omit<
    EditorOptions,
    "staff" | "defaultMember" | "today"
  >;
  return {
    ...options,
    staff: staff
      .filter((m) => m.active)
      .map((m) => ({ id: m.membership_id, label: m.email, active: m.active })),
    defaultMember:
      staff.find((m) => m.user_id === context.user.id)?.membership_id ?? "",
    today: new Date().toLocaleDateString("en-CA", {
      timeZone:
        options.site?.timeZone ?? context.workspace.organization.time_zone,
    }),
  } satisfies EditorOptions;
}

export async function generationState(id: string, page = 1) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("maintenance_generation_state", {
    p_organization_id: context.workspace.organization.id,
    p_plan_id: id,
    p_page: page,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Priprema poseta trenutno nije dostupna.");
  return data as unknown as import("./generation-model").GenerationState;
}
