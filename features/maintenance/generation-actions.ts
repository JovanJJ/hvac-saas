"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generationWindowSchema } from "./generation-model";
export async function generationAction(
  _state: { message?: string },
  form: FormData,
) {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = z
    .object({
      planId: z.uuid(),
      operationId: z.uuid(),
      version: z.coerce.number().int().positive(),
      kind: z.enum(["generate", "retry"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: "Neispravan zahtev. Osvežite stranicu." };
  const data =
    input.data.kind === "generate"
      ? generationWindowSchema.safeParse(Object.fromEntries(form))
      : z.object({ jobId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!data.success)
    return {
      message:
        "Proverite period pripreme: najviše 90 dana, bez datuma u prošlosti.",
    };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("maintenance_generation_command", {
    p_organization_id: context.workspace.organization.id,
    p_plan_id: input.data.planId,
    p_operation_id: input.data.operationId,
    p_kind: input.data.kind,
    p_version: input.data.version,
    p_data: data.data,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Plan ili zahtev su promenjeni ili je plan pauziran. Osvežite i proverite stanje."
          : error.code === "22023"
            ? "Izaberite period do 90 dana unutar narednih godinu dana, bez prošlih datuma."
            : "Zahtev nije potvrđen. Proverite rezultat ili ponovite isti zahtev bez dupliranja poseta.",
    };
  revalidatePath("/maintenance", "layout");
  return {
    message: "Zahtev je sačuvan. Posete će se pojaviti po završetku pripreme.",
  };
}
