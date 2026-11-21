"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancellationSchema, membersSchema, rescheduleSchema } from "./model";
export type ScheduleState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};
export async function changeSchedule(
  _state: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const parsed = z
    .object({
      visitId: z.string().uuid(),
      operationId: z.string().uuid(),
      version: z.coerce.number().int().positive(),
      kind: z.enum(["reschedule", "reassign", "cancel"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { message: "Neispravan zahtev. Osvežite stranicu." };
  const input = parsed.data;
  const values =
    input.kind === "reassign"
      ? { members: [...new Set(form.getAll("members"))].sort() }
      : Object.fromEntries(form);
  const result = (
    input.kind === "reschedule"
      ? rescheduleSchema
      : input.kind === "reassign"
        ? membersSchema
        : cancellationSchema
  ).safeParse(values);
  if (!result.success)
    return {
      message: "Proverite obavezna polja.",
      errors: result.error.flatten().fieldErrors,
    };
  if (input.kind === "cancel" && form.get("confirmed") !== "on")
    return { message: "Potvrdite otkazivanje posete." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("schedule_visit_command", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: input.visitId,
    p_operation_id: input.operationId,
    p_kind: input.kind,
    p_version: input.version,
    p_data: result.data,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Poseta je promenjena ili zaključana. Unos je zadržan; osvežite i uporedite stanje pre ponovnog pokušaja."
          : error.code === "42501"
            ? "Poseta nije dostupna u ovom radnom prostoru."
            : "Promena nije sačuvana. Proverite termin, vremensku zonu i aktivne članove tima. Vreme u prelasku na letnje računanje može biti nepostojeće.",
    };
  for (const path of [
    "/schedule",
    "/today",
    "/visits",
    "/office",
    "/systems",
    "/sites",
    "/customers",
  ])
    revalidatePath(path, "layout");
  return { success: true, message: "Promena rasporeda je sačuvana." };
}
