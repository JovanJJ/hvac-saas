"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseImport } from "./parser";
import { importFields, importLimits, type ImportMapping } from "./model";
export type ImportState = { message?: string; success?: boolean };
export async function uploadImport(
  _state: ImportState,
  form: FormData,
): Promise<ImportState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const id = z.uuid().safeParse(form.get("operationId")),
    file = form.get("file");
  if (
    !id.success ||
    !(file instanceof File) ||
    !file.size ||
    file.size > importLimits.bytes
  )
    return { message: "Izaberite CSV/XLSX fajl do 512 KiB." };
  const filename = file.name.replace(/[\x00-\x1f\\/]/g, "_").slice(-160);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let grid;
  try {
    grid = parseImport(filename, bytes);
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Fajl nije moguće pročitati.",
    };
  }
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("import_upload", {
    p_organization_id: context.workspace.organization.id,
    p_id: id.data,
    p_filename: filename,
    p_source_digest: createHash("sha256").update(bytes).digest("hex"),
    p_grid: grid,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Fajl je promenjen. Otvorite novi uvoz da biste pregledali izmenjeni fajl."
          : "Fajl nije sačuvan. Pokušajte ponovo.",
    };
  redirect(`/imports/${id.data}`);
}
export async function previewImport(
  _state: ImportState,
  form: FormData,
): Promise<ImportState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = z
    .object({ batchId: z.uuid(), operationId: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: "Neispravan zahtev. Osvežite stranicu." };
  const mapping: ImportMapping = {};
  for (const field of Object.keys(
    importFields,
  ) as (keyof typeof importFields)[]) {
    const value = form.get(field);
    if (value !== "" && value !== null) {
      const column = z.coerce.number().int().min(0).max(31).safeParse(value);
      if (!column.success) return { message: "Proverite mapiranje kolona." };
      mapping[field] = column.data;
    }
  }
  if (
    mapping.siteCode === undefined ||
    mapping.systemCode === undefined ||
    new Set(Object.values(mapping)).size !== Object.keys(mapping).length
  )
    return {
      message:
        "Povežite oznake lokacije i sistema. Svaku kolonu koristite samo jednom.",
    };
  const resolutions: Record<string, Record<string, string>> = {};
  for (const [key, value] of form) {
    const match = /^resolve:(\d+):(siteId|systemId)$/.exec(key);
    if (!match || value === "") continue;
    if (!z.uuid().safeParse(value).success)
      return { message: "Proverite izbor lokacije i sistema." };
    (resolutions[match[1]] ??= {})[match[2]] = value as string;
  }
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("import_preview", {
    p_organization_id: context.workspace.organization.id,
    p_batch_id: input.data.batchId,
    p_id: input.data.operationId,
    p_mapping: mapping,
    p_resolutions: resolutions,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Mapiranje je promenjeno. Osvežite stranicu pre novog pregleda."
          : "Pregled nije sačuvan. Proverite mapiranje i pokušajte ponovo.",
    };
  revalidatePath(`/imports/${input.data.batchId}`);
  return {
    success: true,
    message: "Pregled je sačuvan. Registar nije promenjen.",
  };
}
