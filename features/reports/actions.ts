"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type IssueState = { message?: string };
export async function issueReport(
  _state: IssueState,
  form: FormData,
): Promise<IssueState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = z
    .object({
      visitId: z.string().uuid(),
      operationId: z.string().uuid(),
      version: z.coerce.number().int().positive(),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: "Proverite zahtev i pokušajte ponovo." };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("issue_report", {
    p_organization_id: context.workspace.organization.id,
    p_visit_id: input.data.visitId,
    p_operation_id: input.data.operationId,
    p_version: input.data.version,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Poseta je promenjena. Osvežite pregled pre izdavanja."
          : error.code === "42501"
            ? "Nemate dozvolu za izdavanje ovog izveštaja."
            : error.message === "pending_attachments"
              ? "Potvrdite ili uklonite fotografije koje čekaju slanje pre izdavanja."
              : error.message === "visit_not_submitted"
                ? "Poseta mora biti predata kancelariji pre izdavanja."
                : "Proverite ishode, merenja, odgovorne članove tima i potvrđene fotografije. Vratite posetu na dopunu ako je potrebno.",
    };
  for (const path of [
    "/office",
    "/today",
    "/schedule",
    `/visits/${input.data.visitId}`,
    `/visits/${input.data.visitId}/review`,
    `/visits/${input.data.visitId}/preview`,
  ])
    revalidatePath(path);
  redirect(`/office/reports/${data}`);
}

export async function retryReport(
  _state: IssueState,
  form: FormData,
): Promise<IssueState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = z
    .object({ revisionId: z.string().uuid(), operationId: z.string().uuid() })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: "Proverite zahtev i pokušajte ponovo." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("retry_report", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: input.data.revisionId,
    p_operation_id: input.data.operationId,
  });
  if (error)
    return {
      message:
        "Nije moguće ponoviti izradu. Osvežite stranicu i proverite stanje izveštaja.",
    };
  revalidatePath(`/office/reports/${input.data.revisionId}`);
  revalidatePath("/office");
  return {};
}
