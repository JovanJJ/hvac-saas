import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { offlineContext, offlineHeaders } from "@/lib/offline/server";
import { appOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { boundedBody, BodyTooLarge } from "@/features/evidence/request";
import { reservePhotoSchema, MAX_PHOTO_BYTES } from "@/features/evidence/model";
import { attachments } from "@/features/evidence/dal";
import {
  uploadPhoto,
  verifyObject,
  verifierSecret,
  destroyPhoto,
} from "@/features/evidence/provider";
import { verificationProof } from "@/features/evidence/proof";
import type { PhotoAck } from "./photo-model";
const identitySchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  epoch: z.string().uuid(),
});
const requestSchema = reservePhotoSchema.extend({ device: identitySchema });
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: offlineHeaders });
export async function offlinePhotoCommand(request: Request, kind: string) {
  if (!["prepare", "upload", "complete", "remove"].includes(kind))
    return json({ error: "unavailable" }, 404);
  if (request.headers.get("origin") !== appOrigin())
    return json({ error: "origin_denied" }, 403);
  const identity = await offlineContext();
  if (!identity) return json({ error: "identity_unavailable" }, 401);
  let raw: unknown,
    file: File | null = null;
  try {
    if (kind === "upload") {
      const form = await new Response(
        await boundedBody(request, MAX_PHOTO_BYTES + 65536),
        {
          headers: {
            "Content-Type": request.headers.get("content-type") ?? "",
          },
        },
      ).formData();
      raw = JSON.parse(String(form.get("metadata")));
      const input = form.get("file");
      file = input instanceof File ? input : null;
    } else
      raw = JSON.parse((await boundedBody(request, 10000)).toString("utf8"));
  } catch (error) {
    return json(
      { error: "invalid_photo" },
      error instanceof BodyTooLarge ? 413 : 422,
    );
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_photo" }, 422);
  const { device, ...metadata } = parsed.data;
  if (
    device.userId !== identity.userId ||
    device.organizationId !== identity.organizationId ||
    device.epoch !== identity.epoch
  )
    return json({ error: "identity_changed" }, 409);
  const client = await createSupabaseServerClient();
  try {
    // Same assigned-only boundary as downloaded visits, before provider reads or writes.
    const assignments = await client.rpc("offline_assignment_ids", {
      p_organization_id: identity.organizationId,
    });
    if (assignments.error)
      return json(
        { error: "attachment_unavailable" },
        assignments.error.code === "42501" ? 404 : 503,
      );
    if (!assignments.data.includes(metadata.visitId))
      return json({ error: "attachment_unavailable" }, 404);
    let data: unknown = metadata;
    if (kind === "complete" || kind === "upload") {
      const attachment = (
        await attachments(
          identity.organizationId,
          metadata.visitId,
          metadata.attachmentId,
        )
      )[0];
      if (
        !attachment ||
        attachment.author_id !== identity.userId ||
        attachment.state === "removed"
      )
        return json({ error: "attachment_unavailable" }, 404);
      if (
        attachment.item_id !== metadata.itemId ||
        attachment.caption !== metadata.caption ||
        attachment.visibility !== metadata.visibility ||
        attachment.expected_bytes !== metadata.bytes ||
        attachment.mime_type !== metadata.mimeType
      )
        return json({ error: "attachment_conflict" }, 409);
      if (kind === "upload") {
        if (
          !file ||
          file.size !== metadata.bytes ||
          file.type !== metadata.mimeType
        )
          return json({ error: "invalid_photo" }, 422);
        const bundle = await client.rpc("offline_visit_bundle", {
          p_organization_id: identity.organizationId,
          p_visit_id: metadata.visitId,
        });
        if (
          bundle.error ||
          !["scheduled", "in_progress"].includes(
            (bundle.data as { visit: { status: string } }).visit.status,
          )
        )
          return json({ error: "visit_locked" }, 409);
        if (attachment.state !== "verified")
          await uploadPhoto(attachment, Buffer.from(await file.arrayBuffer()));
        const after = (
          await attachments(
            identity.organizationId,
            metadata.visitId,
            metadata.attachmentId,
          )
        )[0];
        if (after?.state === "removed") {
          await destroyPhoto(attachment);
          return json({ error: "attachment_unavailable" }, 404);
        }
        return json({ uploaded: true });
      }
      try {
        data = await verifyObject(attachment);
      } catch (error) {
        const providerError = error as {
          http_code?: number;
          error?: { http_code?: number };
        } | null;
        if (
          providerError?.http_code === 404 ||
          providerError?.error?.http_code === 404
        )
          return json({ error: "photo_not_uploaded" }, 404);
        if (error instanceof Error && error.message === "invalid_photo")
          return json({ error: "invalid_photo" }, 422);
        throw error;
      }
      data = {
        ...(data as object),
        proof: verificationProof(
          verifierSecret(),
          identity.organizationId,
          metadata.visitId,
          metadata.attachmentId,
          identity.userId,
          data as Awaited<ReturnType<typeof verifyObject>>,
        ),
      };
    }
    const phase =
      kind === "prepare" ? "reserve" : (kind as "complete" | "remove");
    const result = await client.rpc("replay_photo_command", {
      p_organization_id: identity.organizationId,
      p_visit_id: metadata.visitId,
      p_attachment_id: metadata.attachmentId,
      p_kind: phase,
      p_data: data,
    });
    if (result.error)
      return json(
        {
          error:
            result.error.code === "42501"
              ? "attachment_unavailable"
              : result.error.code === "PT409"
                ? "attachment_conflict"
                : "invalid_photo",
        },
        result.error.code === "42501"
          ? 404
          : result.error.code === "PT409"
            ? 409
            : result.error.code.startsWith("22")
              ? 422
              : 503,
      );
    let cleanupPending = false;
    if (kind === "remove") {
      const attachment = (
        await attachments(
          identity.organizationId,
          metadata.visitId,
          metadata.attachmentId,
        )
      )[0];
      if (attachment)
        try {
          await destroyPhoto(attachment);
        } catch {
          cleanupPending = true;
        }
    }
    for (const path of [
      `/visits/${metadata.visitId}`,
      `/visits/${metadata.visitId}/review`,
      `/visits/${metadata.visitId}/preview`,
    ])
      revalidatePath(path);
    return json({ acknowledgement: result.data as PhotoAck, cleanupPending });
  } catch {
    return json({ error: "photo_service_unavailable" }, 503);
  }
}
