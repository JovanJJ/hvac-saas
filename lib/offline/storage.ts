import type { OfflineBundle, OfflineIdentity } from "@/features/offline/model";
import {
  draftPayload,
  makeDraft,
  toDraftValues,
  type DraftValues,
  type FieldDraft,
} from "@/features/offline/draft-model";
export { toDraftValues };
export type { DraftValues, FieldDraft };
const DATABASE = "teren-field";
const VERSION = 2;
const MARKER = "teren-offline-boundary";
export const changeEvent = "teren-offline-change";
type Scope = OfflineIdentity & {
  marker: string;
  assignments: string[];
  checkedAt: number;
};
export function currentEpoch() {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("teren_offline_epoch="))
      ?.slice("teren_offline_epoch=".length) || ""
  );
}
function marker() {
  return localStorage.getItem(MARKER) || "";
}
export function notifyChange(detail: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent(changeEvent, { detail }));
  try {
    localStorage.setItem(
      changeEvent,
      JSON.stringify({ ...detail, notification: crypto.randomUUID() }),
    );
  } catch {
    /* A committed IndexedDB write remains committed even if cross-tab notification fails. */
  }
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("bundles")) {
        const bundles = db.createObjectStore("bundles", {
          keyPath: ["userId", "organizationId", "visit.id"],
        });
        bundles.createIndex("partition", ["userId", "organizationId"]);
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", {
          keyPath: ["userId", "organizationId", "visitId", "itemId"],
        });
        drafts.createIndex("visit", ["userId", "organizationId", "visitId"]);
        drafts.createIndex("partition", ["userId", "organizationId"]);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("storage_blocked"));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (
    tx: IDBTransaction,
    done: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["meta", "bundles", "drafts"], mode);
      let result: T,
        failure: Error | null = null;
      const fail = (error: Error) => {
        failure = error;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure || tx.error || new Error("storage_aborted"));
      tx.onerror = () => {};
      try {
        run(
          tx,
          (value) => {
            result = value;
          },
          fail,
        );
      } catch (error) {
        fail(error instanceof Error ? error : new Error("storage_failed"));
      }
    });
  } finally {
    db.close();
  }
}
function validScope(scope: Scope | undefined): scope is Scope {
  return !!scope && scope.epoch === currentEpoch() && scope.marker === marker();
}
function matches(
  scope: Scope | undefined,
  identity: OfflineIdentity,
): scope is Scope {
  return (
    validScope(scope) &&
    scope.userId === identity.userId &&
    scope.organizationId === identity.organizationId &&
    scope.epoch === identity.epoch
  );
}
function guarded<T>(
  identity: OfflineIdentity,
  mode: IDBTransactionMode,
  run: (
    tx: IDBTransaction,
    done: (value: T) => void,
    fail: (error: Error) => void,
    scope: Scope,
  ) => void,
) {
  return transaction<T>(mode, (tx, done, fail) => {
    const request = tx.objectStore("meta").get("active");
    request.onsuccess = () => {
      if (!matches(request.result, identity)) {
        fail(new Error("identity_changed"));
        return;
      }
      run(tx, done, fail, request.result);
    };
  });
}
export async function activeIdentity(): Promise<OfflineIdentity | null> {
  const scope = await transaction<Scope | undefined>("readonly", (tx, done) => {
    const request = tx.objectStore("meta").get("active");
    request.onsuccess = () => done(request.result);
  });
  return validScope(scope) ? scope : null;
}
export async function lockIdentity(discard = false) {
  localStorage.setItem(MARKER, crypto.randomUUID());
  notifyChange({ kind: "identity" });
  await transaction<void>("readwrite", (tx) => {
    tx.objectStore("meta").delete("active");
    if (!discard) return;
    const drafts = tx.objectStore("drafts").getAll();
    drafts.onsuccess = () => {
      const protectedVisits = new Set(
        (drafts.result as FieldDraft[]).map((d) =>
          JSON.stringify([d.userId, d.organizationId, d.visitId]),
        ),
      );
      const cursor = tx.objectStore("bundles").openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (!protectedVisits.has(JSON.stringify(entry.primaryKey)))
          entry.delete();
        entry.continue();
      };
    };
  });
}
export async function fetchPrivate(path: string): Promise<Response> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
export async function verifyIdentity(): Promise<OfflineIdentity> {
  const started = marker(),
    epoch = currentEpoch();
  const response = await fetchPrivate("/api/field/offline-context");
  if (response.status === 401) {
    if (started === marker() && epoch === currentEpoch())
      await lockIdentity(true);
    throw new Error("identity_unavailable");
  }
  if (!response.ok) throw new Error("identity_unavailable");
  const { identity, assignments, checkedAt } = (await response.json()) as {
    identity: OfflineIdentity;
    assignments: string[];
    checkedAt: number;
  };
  if (!Array.isArray(assignments) || !Number.isFinite(checkedAt))
    throw new Error("identity_unavailable");
  if (started !== marker() || identity.epoch !== currentEpoch())
    throw new Error("identity_changed");
  await transaction<void>("readwrite", (tx, _done, fail) => {
    if (started !== marker() || identity.epoch !== currentEpoch()) {
      fail(new Error("identity_changed"));
      return;
    }
    const existing = tx.objectStore("meta").get("active");
    existing.onsuccess = () => {
      const previous = existing.result as Scope | undefined;
      if (
        validScope(previous) &&
        previous.epoch === identity.epoch &&
        previous.checkedAt >= checkedAt
      )
        return;
      tx.objectStore("meta").put(
        { ...identity, marker: started, assignments, checkedAt },
        "active",
      );
      const allowed = new Set(assignments);
      const cursor = tx
        .objectStore("bundles")
        .index("partition")
        .openCursor([identity.userId, identity.organizationId]);
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        // Retain draft evidence in its own locked partition, but remove inaccessible source snapshots.
        if (!allowed.has((entry.value as OfflineBundle).visit.id))
          entry.delete();
        entry.continue();
      };
    };
  });
  notifyChange({ kind: "identity" });
  return identity;
}
export async function listBundles(
  identity: OfflineIdentity,
): Promise<OfflineBundle[]> {
  const started = marker();
  const records = await guarded<OfflineBundle[]>(
    identity,
    "readonly",
    (tx, done) => {
      const request = tx
        .objectStore("bundles")
        .index("partition")
        .getAll([identity.userId, identity.organizationId]);
      request.onsuccess = () =>
        done(
          (request.result as OfflineBundle[]).filter(
            (b) => b.schemaVersion === 1,
          ),
        );
    },
  );
  return started === marker() && identity.epoch === currentEpoch()
    ? records
    : [];
}
export async function saveBundle(
  identity: OfflineIdentity,
  bundle: OfflineBundle,
) {
  if (
    bundle.schemaVersion !== 1 ||
    bundle.userId !== identity.userId ||
    bundle.organizationId !== identity.organizationId
  )
    throw new Error("identity_changed");
  await guarded<void>(identity, "readwrite", (tx, _done, fail, scope) => {
    if (!scope.assignments.includes(bundle.visit.id)) {
      fail(new Error("visit_unavailable"));
      return;
    }
    const pending = tx
      .objectStore("drafts")
      .index("visit")
      .count([identity.userId, identity.organizationId, bundle.visit.id]);
    pending.onsuccess = () => {
      if (pending.result) fail(new Error("local_work_pending"));
      else tx.objectStore("bundles").put(bundle);
    };
  });
  if (identity.epoch !== currentEpoch()) throw new Error("identity_changed");
  notifyChange({ kind: "bundle" });
}
export async function removeBundle(identity: OfflineIdentity, visitId: string) {
  await guarded<void>(identity, "readwrite", (tx, _done, fail) => {
    const pending = tx
      .objectStore("drafts")
      .index("visit")
      .count([identity.userId, identity.organizationId, visitId]);
    pending.onsuccess = () => {
      if (pending.result) fail(new Error("local_work_pending"));
      else
        tx.objectStore("bundles").delete([
          identity.userId,
          identity.organizationId,
          visitId,
        ]);
    };
  });
  notifyChange({ kind: "bundle" });
}
export async function listDrafts(
  identity: OfflineIdentity,
  visitId: string,
): Promise<FieldDraft[]> {
  const started = marker();
  const records = await guarded<FieldDraft[]>(
    identity,
    "readonly",
    (tx, done, _fail, scope) => {
      if (!scope.assignments.includes(visitId)) {
        done([]);
        return;
      }
      const bundle = tx
        .objectStore("bundles")
        .get([identity.userId, identity.organizationId, visitId]);
      bundle.onsuccess = () => {
        if (!bundle.result) {
          done([]);
          return;
        }
        const request = tx
          .objectStore("drafts")
          .index("visit")
          .getAll([identity.userId, identity.organizationId, visitId]);
        request.onsuccess = () => done(request.result);
      };
    },
  );
  return started === marker() && identity.epoch === currentEpoch()
    ? records
    : [];
}
export async function saveDraft(
  identity: OfflineIdentity,
  visitId: string,
  itemId: string,
  values: DraftValues,
  expectedRevision: number,
): Promise<FieldDraft> {
  const record = await guarded<FieldDraft>(
    identity,
    "readwrite",
    (tx, done, fail, scope) => {
      if (!scope.assignments.includes(visitId)) {
        fail(new Error("visit_unavailable"));
        return;
      }
      const source = tx
        .objectStore("bundles")
        .get([identity.userId, identity.organizationId, visitId]);
      source.onsuccess = () => {
        const bundle = source.result as OfflineBundle | undefined;
        if (
          !bundle ||
          !["scheduled", "in_progress"].includes(bundle.visit.status)
        ) {
          fail(new Error("visit_locked"));
          return;
        }
        const key = [identity.userId, identity.organizationId, visitId, itemId];
        const existing = tx.objectStore("drafts").get(key);
        existing.onsuccess = () => {
          const previous = existing.result as FieldDraft | undefined;
          if ((previous?.revision ?? 0) !== expectedRevision) {
            fail(new Error("stale_draft"));
            return;
          }
          if (previous?.status === "queued" || previous?.attemptedAt) {
            fail(new Error("draft_queued"));
            return;
          }
          try {
            const next = makeDraft(identity, bundle, itemId, values, previous);
            tx.objectStore("drafts").put(next);
            done(next);
          } catch (error) {
            fail(error instanceof Error ? error : new Error("draft_invalid"));
          }
        };
      };
    },
  );
  notifyChange({ kind: "draft", visitId, itemId, revision: record.revision });
  return record;
}
export async function changeDraft(
  identity: OfflineIdentity,
  visitId: string,
  itemId: string,
  expectedRevision: number,
  action: "queue" | "edit" | "discard",
): Promise<FieldDraft | null> {
  const record = await guarded<FieldDraft | null>(
    identity,
    "readwrite",
    (tx, done, fail, scope) => {
      if (!scope.assignments.includes(visitId)) {
        fail(new Error("visit_unavailable"));
        return;
      }
      const source = tx
        .objectStore("bundles")
        .get([identity.userId, identity.organizationId, visitId]);
      source.onsuccess = () => {
        const bundle = source.result as OfflineBundle | undefined;
        if (
          !bundle ||
          !["scheduled", "in_progress"].includes(bundle.visit.status)
        ) {
          fail(new Error("visit_locked"));
          return;
        }
        const key = [identity.userId, identity.organizationId, visitId, itemId];
        const request = tx.objectStore("drafts").get(key);
        request.onsuccess = () => {
          const previous = request.result as FieldDraft | undefined;
          if (!previous || previous.revision !== expectedRevision) {
            fail(new Error("stale_draft"));
            return;
          }
          if (previous.attemptedAt) {
            fail(new Error("draft_attempted"));
            return;
          }
          if (action === "discard") {
            tx.objectStore("drafts").delete(key);
            done(null);
            return;
          }
          try {
            const next: FieldDraft = {
              ...previous,
              revision: previous.revision + 1,
              updatedAt: new Date().toISOString(),
              status: action === "queue" ? "queued" : "local",
              queuedAt: action === "queue" ? new Date().toISOString() : null,
              payload:
                action === "queue"
                  ? draftPayload(previous.values, itemId)
                  : null,
            };
            tx.objectStore("drafts").put(next);
            done(next);
          } catch (error) {
            fail(error instanceof Error ? error : new Error("draft_invalid"));
          }
        };
      };
    },
  );
  notifyChange({
    kind: "draft",
    visitId,
    itemId,
    revision: record?.revision ?? 0,
  });
  return record;
}
