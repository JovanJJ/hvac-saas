import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ownerRoster } from "@/features/workspaces/dal";
import {
  readFilters,
  type SearchParams,
  type ScheduleDetail,
  type ScheduleVisit,
} from "./model";
export async function scheduleSnapshot(query: SearchParams) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const filters = readFilters(
    query,
    new Date().toLocaleDateString("en-CA", {
      timeZone: context.workspace.organization.time_zone,
    }),
  );
  const client = await createSupabaseServerClient();
  const [result, staff] = await Promise.all([
    client.rpc("schedule_snapshot", {
      p_organization_id: context.workspace.organization.id,
      p_from: filters.from,
      p_until: filters.until,
      p_site_id: filters.site || undefined,
      p_member_id: filters.technician || undefined,
      p_include_cancelled: filters.cancelled,
    }),
    ownerRoster(context.workspace.organization.id),
  ]);
  if (result.error) throw new Error("Raspored trenutno nije dostupan.");
  const data = result.data as unknown as {
    visits: ScheduleVisit[];
    sites: { id: string; name: string; code: string }[];
  };
  return { ...data, staff, filters };
}
export async function scheduleDetail(id: string) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("schedule_visit_detail", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: id,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Detalji rasporeda nisu dostupni.");
  return {
    detail: data as unknown as ScheduleDetail,
    staff: await ownerRoster(context.workspace.organization.id),
  };
}
