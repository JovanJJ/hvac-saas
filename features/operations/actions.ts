"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type OperationState = { message?: string; success?: boolean };
export async function saveOperation(
  _state: OperationState,
  form: FormData,
): Promise<OperationState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const parsed = z
    .object({
      operationId: z.string().uuid(),
      kind: z.enum(["customer", "site", "system", "visit"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { message: "Proverite zahtev i pokušajte ponovo." };
  const data: Record<string, string | string[]> = {};
  for (const name of [
    "name",
    "contact",
    "customerId",
    "code",
    "address",
    "timeZone",
    "accessNote",
    "siteId",
    "room",
    "model",
    "serial",
    "visitType",
    "start",
    "end",
  ]) {
    const value = form.get(name);
    if (typeof value === "string") {
      if (value.length > 2000) return { message: "Unos je predugačak." };
      data[name] = value;
    }
  }
  if (parsed.data.kind === "visit") {
    data.members = form
      .getAll("members")
      .filter((v): v is string => typeof v === "string");
    data.systems = form
      .getAll("systems")
      .filter((v): v is string => typeof v === "string");
  }
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("save_operation", {
    p_organization_id: context.workspace.organization.id,
    p_operation_id: parsed.data.operationId,
    p_kind: parsed.data.kind,
    p_data: data,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "Oznaka već postoji na ovoj lokaciji."
          : error.message === "operation_conflict"
            ? "Ovaj zahtev je već sačuvan sa drugim podacima. Osvežite stranicu za novi unos."
            : "Proverite obavezna polja, vremenski period i izbor sistema i članova tima.",
    };
  for (const path of [
    "/customers",
    "/sites",
    "/systems",
    "/schedule",
    "/today",
    "/office",
    "/visits/new",
  ])
    revalidatePath(path);
  return { success: true, message: "Sačuvano." };
}
