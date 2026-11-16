import { attachments } from "@/features/evidence/dal";
import { evidenceContext, json } from "@/features/evidence/http";
import {
  MAX_PHOTO_BYTES,
  photoIdentitySchema,
} from "@/features/evidence/model";
import { uploadPhoto } from "@/features/evidence/provider";
import { appOrigin } from "@/lib/supabase/config";
import { boundedBody, BodyTooLarge } from "@/features/evidence/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    return json({ message: "Zahtev nije dozvoljen." }, 403);
  const context = await evidenceContext();
  if (!context) return json({ message: "Prijavite se ponovo." }, 401);
  try {
    const form = await new Response(
      await boundedBody(request, MAX_PHOTO_BYTES + 65536),
      {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      },
    ).formData();
    const parsed = photoIdentitySchema.safeParse(Object.fromEntries(form));
    const file = form.get("file");
    if (
      !parsed.success ||
      !(file instanceof File) ||
      file.size > MAX_PHOTO_BYTES
    )
      return json({ message: "Neispravna fotografija." }, 422);
    const attachment = (
      await attachments(
        context.org,
        parsed.data.visitId,
        parsed.data.attachmentId,
      )
    )[0];
    if (
      !attachment ||
      attachment.author_id !== context.actor ||
      attachment.state !== "reserved" ||
      attachment.expected_bytes !== file.size ||
      attachment.mime_type !== file.type
    )
      return json({ message: "Fotografija ne odgovara rezervaciji." }, 422);
    const client = await createSupabaseServerClient();
    const bundle = await client.rpc("visit_bundle", {
      p_organization_id: context.org,
      p_visit_id: parsed.data.visitId,
    });
    if (
      bundle.error ||
      !["scheduled", "in_progress"].includes(
        (bundle.data as { status: string }).status,
      )
    )
      return json({ message: "Poseta nije otvorena za unos." }, 409);
    await uploadPhoto(attachment, Buffer.from(await file.arrayBuffer()));
    return json({ uploaded: true });
  } catch (error) {
    if (error instanceof Error && error.message === "attachment_denied")
      return json({ message: "Fotografija nije dostupna." }, 404);
    if (error instanceof BodyTooLarge)
      return json({ message: "Fotografija može imati najviše 8 MB." }, 413);
    return json(
      {
        message:
          "Slanje nije potvrđeno. Pokušajte ponovo ili proverite već poslatu fotografiju.",
      },
      503,
    );
  }
}
