import "server-only";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/dal";
import { selectedWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/supabase/config";
import { attachments } from "./dal";
import { photoIdentitySchema, reservePhotoSchema } from "./model";
import { destroyPhoto, verifierSecret, verifyObject } from "./provider";
import { verificationProof } from "./proof";
import { boundedBody, BodyTooLarge } from "./request";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}
export async function evidenceContext() {
  if (!(await currentUser())) return null;
  const context = await selectedWorkspace();
  return context.workspace
    ? { org: context.workspace.organization.id, actor: context.user.id }
    : null;
}
export async function photoCommand(
  request: Request,
  kind: "reserve" | "complete" | "remove",
) {
  if (request.headers.get("origin") !== appOrigin())
    return json({ message: "Zahtev nije dozvoljen." }, 403);
  const context = await evidenceContext();
  if (!context) return json({ message: "Prijavite se ponovo." }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 10000)
    return json({ message: "Prevelik zahtev." }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse((await boundedBody(request, 10000)).toString("utf8"));
  } catch (error) {
    if (error instanceof BodyTooLarge)
      return json({ message: "Prevelik zahtev." }, 413);
    return json({ message: "Neispravan zahtev." }, 422);
  }
  const parsed = (
    kind === "reserve" ? reservePhotoSchema : photoIdentitySchema
  ).safeParse(raw);
  if (!parsed.success)
    return json(
      {
        message:
          "Izaberite JPEG, PNG ili WebP fotografiju do 8 MB, opis i vidljivost.",
      },
      422,
    );
  const { visitId, attachmentId } = parsed.data;
  try {
    verifierSecret();
    const client = await createSupabaseServerClient();
    let data: unknown = parsed.data;
    if (kind === "complete") {
      const attachment = (
        await attachments(context.org, visitId, attachmentId)
      )[0];
      if (!attachment || attachment.state === "removed")
        return json({ message: "Fotografija nije dostupna." }, 404);
      const verified = await verifyObject(attachment);
      data = {
        ...verified,
        proof: verificationProof(
          verifierSecret(),
          context.org,
          visitId,
          attachmentId,
          context.actor,
          verified,
        ),
      };
    }
    const result = await client.rpc("attachment_command", {
      p_organization_id: context.org,
      p_visit_id: visitId,
      p_attachment_id: attachmentId,
      p_kind: kind,
      p_data: data,
    });
    if (result.error)
      return json(
        {
          message:
            result.error.code === "PT409"
              ? "Rezervacija već postoji sa drugim podacima. Uklonite je i započnite novi unos."
              : "Fotografija nije dostupna za ovu promenu. Proverite pristup i stanje posete.",
        },
        result.error.code === "42501"
          ? 404
          : result.error.code === "PT409"
            ? 409
            : 422,
      );
    const attachment = (
      await attachments(context.org, visitId, attachmentId)
    )[0];
    if (!attachment && kind === "remove")
      return json({
        id: attachmentId,
        state: "removed",
        cleanupPending: false,
      });
    let cleanupPending = false;
    if (kind === "remove") {
      try {
        await destroyPhoto(attachment);
      } catch {
        cleanupPending = true;
      }
    }
    for (const path of [
      `/visits/${visitId}`,
      `/visits/${visitId}/review`,
      `/visits/${visitId}/preview`,
    ])
      revalidatePath(path);
    return json({ id: attachmentId, state: attachment.state, cleanupPending });
  } catch (error) {
    return json(
      {
        message:
          error instanceof Error && error.message === "attachment_denied"
            ? "Fotografija nije dostupna."
            : "Fotografija nije potvrđena. Pokušajte ponovo; izabrani fajl ostaje u otvorenoj stranici.",
      },
      error instanceof Error && error.message === "attachment_denied"
        ? 404
        : 503,
    );
  }
}
