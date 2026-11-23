"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { billingCommandSchema } from "./model";
export type BillingActionState = { message?: string; success?: boolean };
export async function billingAction(_state: BillingActionState, form: FormData): Promise<BillingActionState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const parsed = billingCommandSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Unesite belešku i proverite zahtev." };
  const input = parsed.data;
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("billing_review_command", {
    p_organization_id: context.workspace.organization.id, p_visit_id: input.visitId,
    p_operation_id: input.operationId, p_version: input.version, p_visit_version: input.visitVersion,
    p_ready: input.ready === "true", p_note: input.note,
  });
  if (error) return { message: error.code === "PT409"
    ? "Poseta ili oznaka su promenjeni. Beleška je sačuvana u formi; osvežite i ponovo proverite stanje."
    : "Promena nije potvrđena. Proverite stanje ili ponovite isti zahtev." };
  revalidatePath("/office/handover", "layout");
  return { success: true, message: input.ready === "true" ? "Označeno kao spremno za proveru naplate." : "Oznaka spremnosti je uklonjena." };
}
