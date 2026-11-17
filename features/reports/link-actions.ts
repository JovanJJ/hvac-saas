"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/supabase/config";
import { createLinkSchema } from "./link-model";
export type LinkState = { message?: string; url?: string; linkId?: string };
export async function createReportLink(
  _state: LinkState,
  form: FormData,
): Promise<LinkState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = createLinkSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: "Izaberite trajanje linka od 1 do 90 dana." };
  const origin = appOrigin();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("create_report_link", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: input.data.revisionId,
    p_operation_id: input.data.operationId,
    p_token_hash: createHash("sha256").update(input.data.token).digest("hex"),
    p_ttl_days: input.data.days,
  });
  if (error)
    return {
      message:
        error.code === "PT409"
          ? "Link je dostupan samo za spreman PDF. Osvežite stranicu i pokušajte ponovo."
          : "Link nije kreiran. Proverite pristup i pokušajte ponovo.",
    };
  revalidatePath(`/office/reports/${input.data.revisionId}`);
  const link = data as {
    id: string;
    expiresAt: string;
    revokedAt: string | null;
  };
  if (link.revokedAt || new Date(link.expiresAt).getTime() <= Date.now())
    return {
      message:
        "Ovaj link je istekao ili opozvan. Osvežite stranicu i napravite novi link.",
    };
  return { url: `${origin}/r/${input.data.token}`, linkId: link.id };
}
export async function revokeReportLink(
  _state: LinkState,
  form: FormData,
): Promise<LinkState> {
  const context = await requireWorkspace(["owner", "coordinator"]);
  const input = z
    .object({ revisionId: z.string().uuid(), linkId: z.string().uuid() })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Neispravan zahtev." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("revoke_report_link", {
    p_organization_id: context.workspace.organization.id,
    p_link_id: input.data.linkId,
  });
  if (error)
    return {
      message: "Link nije opozvan. Proverite pristup i pokušajte ponovo.",
    };
  revalidatePath(`/office/reports/${input.data.revisionId}`);
  return { message: "Link je opozvan." };
}
