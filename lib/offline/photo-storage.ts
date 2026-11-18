import { reservePhotoSchema } from "@/features/evidence/model";
import type { OfflineIdentity, OfflineBundle } from "@/features/offline/model";
import {
  photoPending,
  type LocalPhoto,
  type PhotoAck,
} from "@/features/offline/photo-model";
import type { Submission } from "@/features/offline/sync-model";
import { guarded, notifyChange, currentEpoch } from "@/lib/offline/storage";
const key = (identity: OfflineIdentity, visitId: string, id?: string) => [
  identity.userId,
  identity.organizationId,
  visitId,
  ...(id ? [id] : []),
];
export async function listPhotos(
  identity: OfflineIdentity,
  visitId: string,
): Promise<LocalPhoto[]> {
  const records = await guarded<LocalPhoto[]>(
    identity,
    "readonly",
    (tx, done, _fail, scope) => {
      if (!scope.assignments.includes(visitId)) {
        done([]);
        return;
      }
      const bundle = tx.objectStore("bundles").get(key(identity, visitId));
      bundle.onsuccess = () => {
        if (!bundle.result) {
          done([]);
          return;
        }
        const request = tx
          .objectStore("photos")
          .index("visit")
          .getAll(key(identity, visitId));
        request.onsuccess = () => done(request.result);
      };
    },
  );
  return identity.epoch === currentEpoch() ? records : [];
}
export async function savePhoto(
  identity: OfflineIdentity,
  visitId: string,
  itemId: string,
  blob: Blob,
  caption: string,
  visibility: string,
) {
  const id = crypto.randomUUID();
  const metadata = reservePhotoSchema.safeParse({
    visitId,
    attachmentId: id,
    itemId,
    caption,
    visibility,
    bytes: blob.size,
    mimeType: blob.type,
  });
  if (!metadata.success)
    throw new Error(
      "Izaberite JPEG, PNG ili WebP do 8 MB, opis i vidljivost fotografije.",
    );
  const values = metadata.data;
  const photo: LocalPhoto = {
    id,
    userId: identity.userId,
    organizationId: identity.organizationId,
    visitId,
    itemId,
    actorLabel: identity.userLabel,
    caption: values.caption,
    visibility: values.visibility,
    bytes: blob.size,
    mimeType: values.mimeType,
    blob,
    createdAt: new Date().toISOString(),
    attemptedAt: null,
    action: "upload",
    state: "queued",
    effects: {},
    serverVersion: 0,
  };
  await guarded<void>(identity, "readwrite", (tx, _done, fail, scope) => {
    if (!scope.assignments.includes(visitId)) {
      fail(new Error("Pristup poseti nije potvrđen."));
      return;
    }
    const source = tx.objectStore("bundles").get(key(identity, visitId));
    const submission = tx
      .objectStore("submissions")
      .get(key(identity, visitId));
    const photos = tx
      .objectStore("photos")
      .index("visit")
      .getAll(key(identity, visitId));
    photos.onsuccess = () => {
      const bundle = source.result as OfflineBundle | undefined;
      if (
        !bundle ||
        !["scheduled", "in_progress"].includes(bundle.visit.status) ||
        !bundle.visit.items.some((i) => i.id === itemId) ||
        submission.result
      ) {
        fail(
          new Error(
            "Poseta nije otvorena za nove fotografije. Otkažite lokalnu predaju pre izmene.",
          ),
        );
        return;
      }
      if (
        bundle.photoCount +
          (photos.result as LocalPhoto[]).filter(photoPending).length >=
        100
      ) {
        fail(new Error("Poseta može imati najviše 100 fotografija."));
        return;
      }
      tx.objectStore("photos").add(photo);
    };
  });
  notifyChange({ kind: "photo", visitId });
  return photo;
}
export async function removeLocalPhoto(
  identity: OfflineIdentity,
  visitId: string,
  id: string,
) {
  await guarded<void>(identity, "readwrite", (tx, _done, fail) => {
    const submission = tx
      .objectStore("submissions")
      .get(key(identity, visitId));
    const request = tx.objectStore("photos").get(key(identity, visitId, id));
    request.onsuccess = () => {
      const photo = request.result as LocalPhoto | undefined;
      if (!photo) return;
      if ((submission.result as Submission | undefined)?.attemptedAt) {
        fail(
          new Error(
            "Predaja čeka potvrdu. Ponovite sinhronizaciju pre uklanjanja fotografije.",
          ),
        );
        return;
      }
      if (!photo.attemptedAt)
        tx.objectStore("photos").delete(key(identity, visitId, id));
      else
        tx.objectStore("photos").put({
          ...photo,
          action: "remove",
          error: undefined,
          errorStatus: undefined,
        });
    };
  });
  notifyChange({ kind: "photo", visitId });
}
export async function retryLocalPhoto(
  identity: OfflineIdentity,
  visitId: string,
  id: string,
) {
  await guarded<void>(identity, "readwrite", (tx) => {
    const request = tx.objectStore("photos").get(key(identity, visitId, id));
    request.onsuccess = () => {
      if (request.result)
        tx.objectStore("photos").put({
          ...request.result,
          error: undefined,
          errorStatus: undefined,
        });
    };
  });
  notifyChange({ kind: "photo", visitId });
}
export async function attemptPhoto(
  identity: OfflineIdentity,
  visitId: string,
  id: string,
): Promise<LocalPhoto | null> {
  return guarded(identity, "readwrite", (tx, done, fail, scope) => {
    if (!scope.assignments.includes(visitId)) {
      fail(new Error("Pristup fotografiji nije potvrđen."));
      return;
    }
    const bundle = tx.objectStore("bundles").get(key(identity, visitId));
    const request = tx.objectStore("photos").get(key(identity, visitId, id));
    request.onsuccess = () => {
      const photo = request.result as LocalPhoto | undefined;
      if (
        !bundle.result ||
        !photo ||
        (!photoPending(photo) && !photo.cleanupPending) ||
        (photo.errorStatus && photo.errorStatus < 500)
      ) {
        done(null);
        return;
      }
      const next = {
        ...photo,
        attemptedAt: photo.attemptedAt ?? new Date().toISOString(),
      };
      tx.objectStore("photos").put(next);
      done(next);
    };
  });
}
export async function photoFailure(
  identity: OfflineIdentity,
  photo: LocalPhoto,
  status: number,
  error: string,
) {
  await guarded<void>(identity, "readwrite", (tx) => {
    const request = tx
      .objectStore("photos")
      .get(key(identity, photo.visitId, photo.id));
    request.onsuccess = () => {
      // A cancellation from another tab remains a cancellation.
      if (
        request.result &&
        request.result.action === photo.action &&
        (photoPending(request.result as LocalPhoto) ||
          request.result.cleanupPending)
      )
        tx.objectStore("photos").put({
          ...request.result,
          errorStatus: status,
          error,
        });
    };
  });
  notifyChange({ kind: "photo", visitId: photo.visitId });
}
export async function acknowledgePhoto(
  identity: OfflineIdentity,
  acknowledgement: PhotoAck,
  cleanupPending?: boolean,
) {
  const ack = acknowledgement;
  if (
    ack.actorId !== identity.userId ||
    !["reserve", "complete", "remove"].includes(ack.phase) ||
    !Number.isInteger(ack.visit.version) ||
    !ack.effects ||
    Object.entries(ack.effects).some(
      ([phase, delta]) =>
        !["reserve", "complete", "remove"].includes(phase) ||
        !Number.isInteger(delta) ||
        delta! < 0 ||
        delta! > 1,
    )
  )
    throw new Error("Potvrda fotografije nije ispravna.");
  await guarded<void>(identity, "readwrite", (tx, _done, fail, scope) => {
    if (!scope.assignments.includes(ack.visitId)) {
      fail(new Error("Pristup fotografiji nije potvrđen."));
      return;
    }
    const source = tx.objectStore("bundles").get(key(identity, ack.visitId));
    const submission = tx
      .objectStore("submissions")
      .get(key(identity, ack.visitId));
    const request = tx
      .objectStore("photos")
      .get(key(identity, ack.visitId, ack.id));
    request.onsuccess = () => {
      const photo = request.result as LocalPhoto | undefined,
        bundle = source.result as OfflineBundle | undefined;
      if (!photo || !bundle || photo.itemId !== ack.itemId) {
        fail(new Error("Fotografija nije dostupna na ovom telefonu."));
        return;
      }
      let delta = 0;
      for (const [phase, effect] of Object.entries(ack.effects))
        if (!(phase in photo.effects)) delta += effect!;
      const newer = ack.visit.version >= photo.serverVersion;
      const state = newer
        ? ack.state === "verified"
          ? "verified"
          : ack.state === "removed"
            ? "removed"
            : "queued"
        : photo.state;
      const pending = submission.result as Submission | undefined;
      if (pending && !pending.attemptedAt && delta)
        tx.objectStore("submissions").put({
          ...pending,
          baseVersion: pending.baseVersion + delta,
        });
      tx.objectStore("photos").put({
        ...photo,
        state,
        effects: { ...photo.effects, ...ack.effects },
        serverVersion: Math.max(photo.serverVersion, ack.visit.version),
        blob: state === "removed" ? null : photo.blob,
        error: undefined,
        errorStatus: undefined,
        cleanupPending:
          ack.phase === "remove"
            ? (cleanupPending ?? photo.cleanupPending)
            : photo.cleanupPending,
      });
      const visit =
        ack.visit.version >= bundle.visit.version
          ? { ...bundle.visit, ...ack.visit }
          : bundle.visit;
      tx.objectStore("bundles").put({
        ...bundle,
        visit,
        photoCount: Math.max(
          0,
          bundle.photoCount +
            (state === "verified" ? 1 : 0) -
            (photo.state === "verified" ? 1 : 0),
        ),
      });
    };
  });
  notifyChange({ kind: "photo-confirmed", visitId: ack.visitId });
}
