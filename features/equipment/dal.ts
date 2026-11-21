import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RegisterDetail, RegisterKind } from "./model";
export async function registerDetail(kind: RegisterKind, id: string) {
  const context = await requireWorkspace(
    kind === "system" ? undefined : ["owner", "coordinator"],
  );
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("register_detail", {
    p_organization_id: context.workspace.organization.id,
    p_kind: kind,
    p_entity_id: id,
  });
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Podaci opreme trenutno nisu dostupni.");
  return { context, detail: data as unknown as RegisterDetail };
}
