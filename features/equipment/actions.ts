"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { schemas } from "./model";
export type RegisterState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};
export async function maintainRegister(
  _previous: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const parsed = z
    .object({
      entityId: z.string().uuid(),
      operationId: z.string().uuid(),
      entity: z.enum(["customer", "site", "system", "unit"]),
      action: z.enum(["update", "archive", "restore", "create", "replace"]),
      version: z.coerce.number().int().positive(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { message: "Proverite zahtev i osvežite stranicu." };
  const { entity, action, ...input } = parsed.data;
  const values =
    action === "archive" || action === "restore"
      ? {}
      : Object.fromEntries(form);
  const validated =
    action === "archive" || action === "restore"
      ? { success: true as const, data: {} }
      : schemas[entity].safeParse(values);
  if (!validated.success)
    return {
      message: "Proverite obavezna polja i format unosa.",
      errors: validated.error.flatten().fieldErrors,
    };
  if (
    (action === "archive" || action === "replace") &&
    form.get("confirmed") !== "on"
  )
    return { message: "Potvrdite arhiviranje ili zamenu pre čuvanja." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("register_command", {
    p_organization_id: context.workspace.organization.id,
    p_entity_id: input.entityId,
    p_operation_id: input.operationId,
    p_kind: `${entity}.${action}`,
    p_version: input.version,
    p_data: validated.data,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Podaci su promenjeni. Vaš unos je zadržan; osvežite i uporedite pre ponovnog čuvanja."
          : error.code === "23505"
            ? "Oznaka već postoji na ovoj lokaciji."
            : error.code === "42501"
              ? "Zapis nije dostupan u ovom radnom prostoru."
              : "Promena nije sačuvana. Proverite polja i da li je roditeljski zapis aktivan.",
    };
  for (const path of [
    "/customers",
    "/sites",
    "/systems",
    "/visits",
    "/schedule",
    "/today",
    "/office",
  ])
    revalidatePath(path, "layout");
  return { success: true, message: "Promena je sačuvana." };
}
