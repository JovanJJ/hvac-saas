"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportRevision } from "./model";
import { amendmentSchema } from "./amendment-model";
export type AmendmentState = { message?: string };
export async function amendReport(
  _state: AmendmentState,
  form: FormData,
): Promise<AmendmentState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  let payload: unknown;
  try {
    const json = form.get("payload");
    if (typeof json !== "string" || Buffer.byteLength(json) > 524288)
      return { message: "Ispravka sadrži previše podataka." };
    payload = JSON.parse(json);
  } catch {
    return { message: "Proverite zahtev za ispravku." };
  }
  const input = amendmentSchema.safeParse(payload);
  if (!input.success)
    return {
      message:
        "Unesite razlog i proverite sve ishode, merenja, materijal i odgovorne članove tima.",
    };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("amend_report", {
    p_organization_id: context.workspace.organization.id,
    p_base_revision_id: input.data.baseRevisionId,
    p_operation_id: input.data.operationId,
    p_version: input.data.version,
    p_reason: input.data.reason,
    p_items: input.data.items,
  });
  if (error)
    return {
      message:
        error.message === "follow_up_managed"
          ? "Ovom radnjom već upravlja kancelarija. Promenite je kroz Sledeće radnje; u ispravci zadržite njene podatke."
          : error.code === "PT409"
            ? "Poseta ili revizija je promenjena. Osvežite stranicu i uporedite ispravku pre ponovnog izdavanja."
            : error.message === "no_corrections"
              ? "Unesite bar jednu izmenu pre izdavanja nove revizije."
              : "Ispravka nije izdata. Proverite kompletan unos, aktivne odgovorne osobe i dozvoljeni pristup.",
    };
  const replacement = await client.rpc("report_revision", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: data,
  });
  const visitId = (replacement.data as ReportRevision | null)?.visitId;
  const paths = [
    "/office",
    "/today",
    "/schedule",
    `/office/reports/${input.data.baseRevisionId}`,
    `/office/reports/${data}`,
  ];
  if (visitId)
    paths.push(
      `/visits/${visitId}`,
      `/visits/${visitId}/review`,
      `/visits/${visitId}/preview`,
    );
  for (const path of paths) revalidatePath(path);
  redirect(`/office/reports/${data}`);
}
