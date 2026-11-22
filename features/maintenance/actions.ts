"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planSchema, type Occurrence } from "./model";
export type PlanState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  occurrences?: Occurrence[];
  revision?: string;
};
export async function planAction(
  _state: PlanState,
  form: FormData,
): Promise<PlanState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const intent = z
    .enum(["create", "edit", "preview", "set_enabled"])
    .safeParse(form.get("intent"));
  if (!intent.success) return { message: "Neispravan zahtev." };
  const client = await createSupabaseServerClient();
  const org = context.workspace.organization.id;
  let data: unknown;
  if (
    intent.data === "preview" ||
    intent.data === "create" ||
    intent.data === "edit"
  ) {
    const input = planSchema.safeParse({
      ...Object.fromEntries(form),
      systems: [...new Set(form.getAll("systems"))].sort(),
      members: [...new Set(form.getAll("members"))].sort(),
    });
    if (!input.success)
      return {
        message: "Proverite obavezna polja i izbor sistema i tima.",
        errors: input.error.flatten().fieldErrors,
      };
    data = input.data;
    if (intent.data === "preview") {
      const from = z.iso
        .date()
        .refine((value) => value >= "2000-01-01" && value <= "2200-12-31")
        .safeParse(form.get("from"));
      if (!from.success)
        return { message: "Unesite važeći početni datum pregleda." };
      const { data, error } = await client.rpc("maintenance_preview", {
        p_organization_id: org,
        p_data: input.data,
        p_from: from.data,
        p_count: 6,
      });
      if (error) return { message: planError(error.code) };
      return {
        occurrences: data as unknown as Occurrence[],
        revision: String(form.get("revision")),
        message: "Pregled unetih podataka. Posete nisu kreirane.",
      };
    }
  }
  const command = z
    .object({
      planId: z.uuid(),
      operationId: z.uuid(),
      version: z.coerce.number().int().min(0),
    })
    .safeParse(Object.fromEntries(form));
  if (!command.success)
    return { message: "Neispravan zahtev. Osvežite stranicu." };
  if (intent.data === "set_enabled") {
    if (!["true", "false"].includes(String(form.get("enabled"))))
      return { message: "Proverite stanje plana." };
    data = { enabled: form.get("enabled") === "true" };
  }
  if (!data) return { message: "Proverite podatke plana." };
  const { error } = await client.rpc("maintenance_plan_command", {
    p_organization_id: org,
    p_plan_id: command.data.planId,
    p_operation_id: command.data.operationId,
    p_kind: intent.data,
    p_version: command.data.version,
    p_data: data,
  });
  if (error) return { message: planError(error.code) };
  revalidatePath("/maintenance", "layout");
  if (intent.data === "create") redirect(`/maintenance/${command.data.planId}`);
  return {
    success: true,
    message:
      intent.data === "set_enabled"
        ? "Stanje plana je sačuvano."
        : "Plan je sačuvan. Učitajte sačuvano stanje pre sledeće izmene.",
  };
}
function planError(code: string | undefined) {
  return code === "PT409"
    ? "Plan ili vremenska zona su promenjeni. Unos je zadržan; osvežite i proverite stanje pre ponovnog čuvanja."
    : code === "42501"
      ? "Plan nije dostupan ovom nalogu."
      : "Zahtev nije potvrđen. Proverite aktivnu lokaciju, sisteme i članove tima. Možete ponoviti isti zahtev bez dupliranja plana.";
}
