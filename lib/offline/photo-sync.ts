import type { OfflineIdentity } from "@/features/offline/model";
import {
  photoPending,
  type LocalPhoto,
  type PhotoAck,
} from "@/features/offline/photo-model";
import { activeIdentity, lockIdentity } from "@/lib/offline/storage";
import {
  listPhotos,
  attemptPhoto,
  acknowledgePhoto,
  photoFailure,
} from "./photo-storage";
class PhotoFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
async function current(identity: OfflineIdentity) {
  const active = await activeIdentity();
  if (
    !active ||
    active.userId !== identity.userId ||
    active.organizationId !== identity.organizationId ||
    active.epoch !== identity.epoch
  )
    throw new Error("Nalog je promenjen. Slanje fotografija je zaustavljeno.");
}
async function command(
  identity: OfflineIdentity,
  photo: LocalPhoto,
  kind: "prepare" | "complete" | "upload" | "remove",
) {
  await current(identity);
  const metadata = {
    visitId: photo.visitId,
    attachmentId: photo.id,
    itemId: photo.itemId,
    caption: photo.caption,
    visibility: photo.visibility,
    bytes: photo.bytes,
    mimeType: photo.mimeType,
    device: {
      userId: identity.userId,
      organizationId: identity.organizationId,
      epoch: identity.epoch,
    },
  };
  let body: BodyInit, headers: HeadersInit | undefined;
  if (kind === "upload") {
    if (!photo.blob) throw new PhotoFailure(422, "missing_blob");
    const form = new FormData();
    form.set("metadata", JSON.stringify(metadata));
    form.set("file", photo.blob, `photo.${photo.mimeType.split("/")[1]}`);
    body = form;
  } else {
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify(metadata);
  }
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`/api/field/offline-photos/${kind}`, {
      method: "POST",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    await current(identity);
    if (response.status === 401) {
      await lockIdentity(true);
      throw new Error(
        "Sesija je istekla. Prijavite se ponovo istim nalogom; fotografije su zadržane.",
      );
    }
    const result = (await response.json()) as {
      acknowledgement?: PhotoAck;
      cleanupPending?: boolean;
      error?: string;
      uploaded?: boolean;
    };
    if (!response.ok)
      throw new PhotoFailure(
        response.status,
        result.error || "photo_service_unavailable",
      );
    if (kind !== "upload") {
      if (
        !result.acknowledgement ||
        result.acknowledgement.id !== photo.id ||
        result.acknowledgement.visitId !== photo.visitId ||
        result.acknowledgement.phase !== (kind === "prepare" ? "reserve" : kind)
      )
        throw new Error("Potvrda fotografije nije ispravna. Fajl je zadržan.");
      await acknowledgePhoto(
        identity,
        result.acknowledgement,
        result.cleanupPending,
      );
    } else if (!result.uploaded)
      throw new Error("Slanje fotografije nije potvrđeno. Fajl je zadržan.");
  } finally {
    clearTimeout(timer);
  }
}
export async function syncPhotos(identity: OfflineIdentity, visitId: string) {
  let confirmed = 0,
    retained = false;
  const records = (await listPhotos(identity, visitId))
    .filter((p) => photoPending(p) || p.cleanupPending)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const candidate of records.slice(0, 10)) {
    let photo = await attemptPhoto(identity, visitId, candidate.id);
    if (!photo) {
      retained = true;
      continue;
    }
    try {
      // Re-read durable intent before every phase so a concurrent cancellation stays a cancellation.
      for (let step = 0; step < 4 && photo; step++) {
        if (!("reserve" in photo.effects))
          await command(identity, photo, "prepare");
        else if (photo.action === "remove") {
          await command(identity, photo, "remove");
          confirmed++;
          break;
        } else {
          try {
            await command(identity, photo, "complete");
          } catch (error) {
            if (
              !(
                error instanceof PhotoFailure &&
                error.code === "photo_not_uploaded"
              )
            )
              throw error;
            await command(identity, photo, "upload");
            photo = await attemptPhoto(identity, visitId, candidate.id);
            if (!photo) break;
            if (photo.action === "remove") continue;
            await command(identity, photo, "complete");
          }
          confirmed++;
        }
        photo = await attemptPhoto(identity, visitId, candidate.id);
      }
    } catch (error) {
      if (error instanceof PhotoFailure) {
        await photoFailure(
          identity,
          photo ?? candidate,
          error.status,
          error.code,
        );
        retained = true;
        if (error.status >= 500)
          throw new Error(
            "Fotografija nije potvrđena. Fajl je zadržan; slanje će biti ponovljeno.",
          );
      } else
        throw new Error(
          error instanceof Error && error.message.startsWith("Sesija ")
            ? error.message
            : "Slanje ili potvrda fotografije nije sačuvana. Fajl je zadržan za bezbedan ponovni pokušaj.",
        );
    }
  }
  return { confirmed, retained: retained || records.length > 10 };
}
