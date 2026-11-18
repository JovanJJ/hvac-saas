"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type FollowUpState = {
  message?: string;
  success?: boolean;
  visitId?: string;
};
const commandSchema = z.object({
  actionId: z.string().uuid(),
  operationId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  kind: z.enum(["assign", "complete", "book"]),
});
const assignmentSchema = z.object({
  ownerId: z.string().uuid(),
  dueDate: z.iso.date(),
});
const completionSchema = z.object({ note: z.string().trim().min(1).max(2000) });
const bookingSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  members: z.array(z.string().uuid()).min(1).max(100),
});
export async function manageFollowUp(
  _state: FollowUpState,
  form: FormData,
): Promise<FollowUpState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const values = Object.fromEntries(form);
  const command = commandSchema.safeParse(values);
  if (!command.success)
    return { message: "Proverite zahtev i osvežite stranicu." };
  const { actionId, operationId, version, kind } = command.data;
  const input =
    kind === "assign"
      ? assignmentSchema.safeParse(values)
      : kind === "complete"
        ? completionSchema.safeParse(values)
        : bookingSchema.safeParse({
            ...values,
            members: form.getAll("members"),
          });
  if (!input.success)
    return {
      message: "Popunite obavezna polja i izaberite odgovornog člana tima.",
    };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("follow_up_command", {
    p_organization_id: context.workspace.organization.id,
    p_action_id: actionId,
    p_operation_id: operationId,
    p_version: version,
    p_kind: kind,
    p_data: input.data,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Radnja je promenjena ili već zakazana. Osvežite stranicu i proverite postojeće podatke."
          : "Promena nije sačuvana. Proverite odgovornu osobu, rok, period i članove tima.",
    };
  for (const path of [
    "/office/actions",
    "/office/actions/[actionId]",
    "/office",
    "/schedule",
    "/today",
    "/visits/[visitId]",
  ]) {
    revalidatePath(path, path.includes("[") ? "page" : undefined);
  }
  revalidatePath("/visits/[visitId]/review", "page");
  revalidatePath("/visits/[visitId]/preview", "page");
  return {
    success: true,
    message: kind === "book" ? "Povratna poseta je zakazana." : "Sačuvano.",
    ...(kind === "book" ? { visitId: data } : {}),
  };
}
