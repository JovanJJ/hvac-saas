"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { itemSchema } from "./model";
export type CommandState = { message?: string; success?: boolean };
export async function visitCommand(
  _state: CommandState,
  form: FormData,
): Promise<CommandState> {
  const parsed = z
    .object({
      visitId: z.string().uuid(),
      operationId: z.string().uuid(),
      kind: z.enum(["save", "submit", "return", "add"]),
      version: z.coerce.number().int().positive(),
      payload: z.string().max(30000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Proverite unos i pokušajte ponovo." };
  const { kind, visitId, operationId, version, payload } = parsed.data;
  const context = await requireWorkspace(
    kind === "return" ? ["owner", "coordinator"] : undefined,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { message: "Neispravan unos." };
  }
  const schema =
    kind === "save"
      ? itemSchema
      : kind === "return"
        ? z.object({ reason: z.string().trim().min(1).max(2000) })
        : kind === "add"
          ? z.object({ systemId: z.string().uuid() })
          : z.object({});
  const data = schema.safeParse(raw);
  if (!data.success)
    return {
      message:
        data.error.issues[0]?.code === "custom"
          ? data.error.issues[0].message
          : "Proverite ishod, merenja, količine i radnje. Izmerena vrednost mora biti broj; prazan unos nije nula.",
    };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("visit_command", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: visitId,
    p_operation_id: operationId,
    p_kind: kind,
    p_version: version,
    p_data: data.data,
  });
  if (error)
    return {
      message:
        error.message === "follow_up_managed"
          ? "Radnjom već upravlja kancelarija. Osvežite stranicu i zadržite njene podatke pri dopuni nalaza."
          : error.code === "PT409"
            ? "Podaci su promenjeni. Osvežite stranicu i uporedite unos pre ponovnog čuvanja."
            : error.code === "42501"
              ? "Pristup poseti više nije dozvoljen."
              : error.message === "pending_items"
                ? "Unesite ishod za svaki sistem."
                : error.message === "pending_attachments"
                  ? "Potvrdite ili uklonite fotografije koje čekaju slanje."
                  : error.message === "missing_follow_up"
                    ? "Proverite nalaze, odgovorne članove tima i rokove."
                    : "Proverite unos i stanje posete. Osvežite stranicu ako je poseta već predata.",
    };
  for (const path of [
    `/visits/${visitId}`,
    `/visits/${visitId}/review`,
    `/visits/${visitId}/preview`,
    "/office",
    "/today",
    "/schedule",
  ])
    revalidatePath(path);
  return {
    success: true,
    message:
      kind === "save"
        ? "Sačuvano na serveru."
        : kind === "submit"
          ? "Poseta je predata kancelariji."
          : kind === "return"
            ? "Vraćeno na dopunu."
            : "Sistem je dodat.",
  };
}
