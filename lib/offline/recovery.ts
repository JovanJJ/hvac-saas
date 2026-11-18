import type { OfflineIdentity, OfflineBundle } from "@/features/offline/model";
import type { FieldDraft } from "@/features/offline/draft-model";
import { makeDraft, toDraftValues } from "@/features/offline/draft-model";
import type { Submission, SyncOperation } from "@/features/offline/sync-model";
import type {
  RecoveryContext,
  RetainedWork,
} from "@/features/offline/recovery-model";
import { photoPending, type LocalPhoto } from "@/features/offline/photo-model";
import {
  guarded,
  notifyChange,
  activeIdentity,
  verifyIdentity,
  lockIdentity,
  acknowledgeSync,
} from "@/lib/offline/storage";
import { acknowledgePhoto } from "./photo-storage";
const key = (identity: OfflineIdentity, visitId: string) => [
  identity.userId,
  identity.organizationId,
  visitId,
];
export const draftOperation = (draft: FieldDraft): SyncOperation => ({
  type: "save",
  entityId: draft.visitId,
  operationId: draft.operationId,
  reconcileFrom: draft.reconcileFrom,
  baseVersion: draft.baseItemVersion,
  payload: draft.payload!,
});
export const submissionOperation = (s: Submission): SyncOperation => ({
  type: "submit",
  entityId: s.visitId,
  operationId: s.operationId,
  reconcileFrom: s.reconcileFrom,
  baseVersion: s.baseVersion,
  payload: {},
});
async function assertIdentity(identity: OfflineIdentity) {
  const current = await activeIdentity();
  if (
    !current ||
    current.userId !== identity.userId ||
    current.organizationId !== identity.organizationId ||
    current.epoch !== identity.epoch
  )
    throw new Error(
      "Nalog ili radni prostor je promenjen. Ponovo otvorite posetu.",
    );
}
export async function readRecovery(
  identity: OfflineIdentity,
  visitId: string,
  operation: SyncOperation | null,
): Promise<RecoveryContext> {
  await assertIdentity(identity);
  const photoIds = await guarded<string[]>(identity, "readonly", (tx, done) => {
    const r = tx
      .objectStore("photos")
      .index("visit")
      .getAll(key(identity, visitId));
    r.onsuccess = () => done((r.result as LocalPhoto[]).map((p) => p.id));
  });
  const response = await fetch("/api/field/recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      userId: identity.userId,
      organizationId: identity.organizationId,
      epoch: identity.epoch,
      visitId,
      operation,
      photoIds,
    }),
  });
  await assertIdentity(identity);
  if (response.status === 401) {
    await lockIdentity(true);
    throw new Error(
      "Sesija je istekla. Prijavite se ponovo istim nalogom; lokalni rad je zadržan.",
    );
  }
  if (response.status === 404) {
    await verifyIdentity();
    throw new Error(
      "Pristup poseti je povučen. Lokalni rad je zadržan i neće se slati.",
    );
  }
  if (!response.ok)
    throw new Error(
      "Trenutno stanje nije dostupno. Proverite vezu i ponovo učitajte poređenje.",
    );
  const context = (await response.json()) as RecoveryContext;
  if (
    context.bundle.userId !== identity.userId ||
    context.bundle.organizationId !== identity.organizationId ||
    context.bundle.visit.id !== visitId
  )
    throw new Error("Poređenje nije za trenutni nalog i posetu.");
  // Replaying an already committed operation is acknowledgement, never a new edit.
  if (
    operation &&
    context.operation?.status === "committed" &&
    context.operation.acknowledgement
  )
    await acknowledgeSync(
      identity,
      operation,
      context.operation.acknowledgement,
    );
  for (const ack of context.photoReceipts)
    await acknowledgePhoto(identity, ack);
  return context;
}
export async function resolveOperation(
  identity: OfflineIdentity,
  context: RecoveryContext,
  operation: SyncOperation,
  revision: number | null,
  choice: "local" | "server",
) {
  const visitId = operation.entityId;
  if (context.operation?.status === "committed")
    throw new Error("Operacija je već potvrđena. Ponovo otvorite posetu.");
  if (choice === "local" && context.operation?.status !== "absent")
    throw new Error(
      "Operacija već ima drugačiju potvrdu. Zadržite podatke sa servera i pripremite novi unos.",
    );
  if (
    choice === "local" &&
    !["scheduled", "in_progress"].includes(context.bundle.visit.status)
  )
    throw new Error(
      "Poseta više nije otvorena za izmene. Lokalni rad ostaje zadržan.",
    );
  await guarded<void>(identity, "readwrite", (tx, _done, fail, scope) => {
    if (!scope.assignments.includes(visitId)) {
      fail(new Error("Pristup poseti više nije dozvoljen."));
      return;
    }
    const source = tx.objectStore("bundles").get(key(identity, visitId));
    const submission = tx
      .objectStore("submissions")
      .get(key(identity, visitId));
    const drafts = tx
      .objectStore("drafts")
      .index("visit")
      .getAll(key(identity, visitId));
    const photos = tx
      .objectStore("photos")
      .index("visit")
      .getAll(key(identity, visitId));
    const store = tx.objectStore(
      operation.type === "save" ? "drafts" : "submissions",
    );
    const recordKey =
      operation.type === "save"
        ? [...key(identity, visitId), operation.payload.itemId]
        : key(identity, visitId);
    const record = store.get(recordKey);
    record.onsuccess = () => {
      const previous = record.result as FieldDraft | Submission | undefined,
        pending = submission.result as Submission | undefined;
      if (
        !previous ||
        previous.operationId !== operation.operationId ||
        (operation.type === "save" &&
          (previous as FieldDraft).revision !== revision)
      ) {
        fail(
          new Error(
            "Drugi prozor je promenio nacrt. Učitajte poređenje ponovo.",
          ),
        );
        return;
      }
      if (
        !source.result ||
        (source.result as OfflineBundle).visit.version >
          context.bundle.visit.version
      ) {
        fail(
          new Error(
            "Novije stanje je već preuzeto. Učitajte poređenje ponovo.",
          ),
        );
        return;
      }
      if (
        previous.attemptedAt &&
        ![409, 422].includes(previous.errorStatus ?? 0)
      ) {
        fail(
          new Error(
            "Ishod slanja nije poznat. Ponovite sinhronizaciju pre usaglašavanja.",
          ),
        );
        return;
      }
      if (
        pending?.attemptedAt &&
        ![409, 422].includes(pending.errorStatus ?? 0)
      ) {
        fail(
          new Error(
            "Predaja čeka potvrdu. Ponovite sinhronizaciju pre izmene.",
          ),
        );
        return;
      }
      if (
        operation.type === "submit" &&
        (drafts.result.length ||
          (photos.result as LocalPhoto[]).some(photoPending))
      ) {
        fail(
          new Error(
            "Najpre usaglasite i sinhronizujte nacrte i fotografije, pa ponovo pregledajte predaju.",
          ),
        );
        return;
      }
      const replacementId = crypto.randomUUID();
      if (pending && operation.type === "save")
        tx.objectStore("recoveries").put({
          userId: identity.userId,
          organizationId: identity.organizationId,
          operationId: pending.operationId,
          visitId,
          previous: structuredClone(pending),
          replacementId,
          choice: "cancelled-after-item-review",
          reviewedAt: new Date().toISOString(),
          serverVersion: context.bundle.visit.version,
        });
      tx.objectStore("recoveries").put({
        userId: identity.userId,
        organizationId: identity.organizationId,
        operationId: previous.operationId,
        visitId,
        previous: structuredClone(previous),
        replacementId,
        choice,
        reviewedAt: new Date().toISOString(),
        serverVersion: context.bundle.visit.version,
      });
      tx.objectStore("bundles").put(context.bundle);
      tx.objectStore("submissions").delete(key(identity, visitId));
      if (choice === "server") store.delete(recordKey);
      else if (operation.type === "save") {
        const old = previous as FieldDraft,
          item = context.bundle.visit.items.find((i) => i.id === old.itemId);
        if (!item) {
          fail(
            new Error("Sistem više nije u poseti. Lokalni nacrt je zadržan."),
          );
          return;
        }
        const values = {
          ...old.values,
          followUp: item.followUp?.managedAt
            ? toDraftValues(item).followUp
            : old.values.followUp,
        };
        const next = makeDraft(identity, context.bundle, old.itemId, values);
        tx.objectStore("drafts").put({
          ...next,
          operationId: replacementId,
          reconcileFrom: old.operationId,
          revision: old.revision + 1,
        });
      } else {
        const next: Submission = {
          userId: identity.userId,
          organizationId: identity.organizationId,
          visitId,
          operationId: replacementId,
          reconcileFrom: previous.operationId,
          baseVersion: context.bundle.visit.version,
          prerequisites: [],
          queuedAt: new Date().toISOString(),
          attemptedAt: null,
        };
        tx.objectStore("submissions").put(next);
      }
    };
  });
  notifyChange({ kind: "reconciled", visitId });
}
export async function retainedWork(
  identity: OfflineIdentity,
): Promise<RetainedWork[]> {
  return guarded(identity, "readonly", (tx, done, _fail, scope) => {
    const partition = [identity.userId, identity.organizationId];
    const bundles = tx
      .objectStore("bundles")
      .index("partition")
      .getAll(partition);
    const drafts = tx
      .objectStore("drafts")
      .index("partition")
      .getAll(partition);
    const submissions = tx
      .objectStore("submissions")
      .index("partition")
      .getAll(partition);
    const photos = tx
      .objectStore("photos")
      .index("partition")
      .getAll(partition);
    photos.onsuccess = () => {
      const visits = new Map<string, RetainedWork>();
      const entry = (id: string) => {
        if (!visits.has(id))
          visits.set(id, {
            visitId: id,
            drafts: 0,
            photos: 0,
            submission: false,
            assigned: scope.assignments.includes(id),
          });
        return visits.get(id)!;
      };
      for (const d of drafts.result as FieldDraft[]) entry(d.visitId).drafts++;
      for (const s of submissions.result as Submission[])
        entry(s.visitId).submission = true;
      for (const p of photos.result as LocalPhoto[])
        if (photoPending(p)) entry(p.visitId).photos++;
      done(
        [...visits.values()].filter(
          (v) =>
            !(bundles.result as OfflineBundle[]).some(
              (b) => b.visit.id === v.visitId,
            ),
        ),
      );
    };
  });
}
export async function restoreRetainedWork(
  identity: OfflineIdentity,
  visitId: string,
) {
  const verified = await verifyIdentity();
  if (
    verified.userId !== identity.userId ||
    verified.organizationId !== identity.organizationId
  )
    throw new Error("Otvorite prvobitni nalog i radni prostor.");
  // Reverification restores new blocked copies. Older releases may have retained operations without a source snapshot.
  const photoIds = await guarded<string[]>(
    verified,
    "readonly",
    (tx, done, _fail, scope) => {
      if (!scope.assignments.includes(visitId)) {
        done([]);
        return;
      }
      const r = tx
        .objectStore("photos")
        .index("visit")
        .getAll(key(verified, visitId));
      r.onsuccess = () => done((r.result as LocalPhoto[]).map((p) => p.id));
    },
  );
  const response = await fetch("/api/field/recovery", {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({
      userId: verified.userId,
      organizationId: verified.organizationId,
      epoch: verified.epoch,
      visitId,
      operation: null,
      photoIds,
    }),
  });
  if (!response.ok)
    throw new Error(
      "Pristup poseti još nije obnovljen. Lokalni rad je zadržan.",
    );
  const context = (await response.json()) as RecoveryContext;
  if (
    context.bundle.userId !== verified.userId ||
    context.bundle.organizationId !== verified.organizationId ||
    context.bundle.visit.id !== visitId
  )
    throw new Error("Poređenje nije za trenutni nalog i posetu.");
  await guarded<void>(verified, "readwrite", (tx, _done, fail, scope) => {
    if (!scope.assignments.includes(visitId)) {
      fail(new Error("Pristup nije obnovljen."));
      return;
    }
    const r = tx.objectStore("bundles").get(key(verified, visitId));
    r.onsuccess = () => {
      if (!r.result) tx.objectStore("bundles").put(context.bundle);
    };
  });
  for (const ack of context.photoReceipts)
    await acknowledgePhoto(verified, ack);
  await guarded<void>(verified, "readwrite", (tx) => {
    const request = tx.objectStore("bundles").get(key(verified, visitId));
    request.onsuccess = () => {
      const bundle = request.result as OfflineBundle | undefined;
      if (bundle && bundle.visit.version === context.bundle.visit.version)
        tx.objectStore("bundles").put({
          ...bundle,
          photoCount: context.bundle.photoCount,
        });
    };
  });
  notifyChange({ kind: "access-restored", visitId });
}
