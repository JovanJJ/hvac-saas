// One storage implementation is shared by Next client controls and the public offline shell.
const DATABASE = "teren-field";
const VERSION = 1;
const EPOCH_COOKIE = "teren_offline_epoch";
const MARKER = "teren-offline-boundary";
export const changeEvent = "teren-offline-change";
/** @typedef {import('../../../features/offline/model').OfflineIdentity} Identity */
/** @typedef {import('../../../features/offline/model').OfflineBundle} Bundle */
export function currentEpoch() {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(EPOCH_COOKIE + "="))
      ?.slice(EPOCH_COOKIE.length + 1) || ""
  );
}
function marker() {
  return localStorage.getItem(MARKER) || "";
}
export function notifyChange() {
  window.dispatchEvent(new Event(changeEvent));
  localStorage.setItem(changeEvent, crypto.randomUUID());
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const bundles = db.createObjectStore("bundles", {
        keyPath: ["userId", "organizationId", "visit.id"],
      });
      bundles.createIndex("partition", ["userId", "organizationId"]);
      db.createObjectStore("meta");
    };
    request.onerror = () => reject(request.error);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("storage_blocked"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
/** Resolve only after transaction commit, including for writes and removals. */
async function transaction(mode, run) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["meta", "bundles"], mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error || new Error("storage_aborted"));
      tx.onerror = () => {}; // Abort is the terminal result; never report request success as commit.
      try {
        run(tx, (result) => {
          value = result;
        });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}
function validScope(scope) {
  return scope && scope.epoch === currentEpoch() && scope.marker === marker();
}
/** @returns {Promise<Identity | null>} */
export async function activeIdentity() {
  const scope = await transaction("readonly", (tx, done) => {
    const request = tx.objectStore("meta").get("active");
    request.onsuccess = () => done(request.result);
  });
  return validScope(scope) ? scope : null;
}
/** Invalidate synchronously across tabs before an identity-changing form is sent. */
export async function lockIdentity(discard = false) {
  localStorage.setItem(MARKER, crypto.randomUUID());
  notifyChange();
  await transaction("readwrite", (tx) => {
    tx.objectStore("meta").delete("active");
    if (discard) tx.objectStore("bundles").clear();
  });
}
/** @param {string} path @returns {Promise<Response>} */
export async function fetchPrivate(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
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
/** Verify the current session/workspace; old in-flight responses cannot restore an old binding. */
export async function verifyIdentity() {
  const started = marker();
  const startedEpoch = currentEpoch();
  const response = await fetchPrivate("/api/field/offline-context");
  if (response.status === 401) {
    if (started === marker() && startedEpoch === currentEpoch())
      await lockIdentity(true);
    throw new Error("identity_unavailable");
  }
  if (!response.ok) throw new Error("identity_unavailable");
  /** @type {{identity: Identity, assignments: string[], checkedAt: number}} */
  const { identity, assignments, checkedAt } = await response.json();
  if (!Array.isArray(assignments) || !Number.isFinite(checkedAt))
    throw new Error("identity_unavailable");
  if (started !== marker() || identity.epoch !== currentEpoch())
    throw new Error("identity_changed");
  await transaction("readwrite", (tx) => {
    if (started !== marker() || identity.epoch !== currentEpoch()) {
      tx.abort();
      return;
    }
    const existing = tx.objectStore("meta").get("active");
    existing.onsuccess = () => {
      const previous = existing.result;
      // A slower, older inventory response cannot restore a permission already withdrawn.
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
        if (!allowed.has(entry.value.visit.id)) entry.delete();
        entry.continue();
      };
    };
  });
  notifyChange();
  return identity;
}
/** @param {Identity} identity */
export async function listBundles(identity) {
  const started = marker();
  const records = await transaction("readonly", (tx, done) => {
    const active = tx.objectStore("meta").get("active");
    active.onsuccess = () => {
      const scope = active.result;
      if (
        !validScope(scope) ||
        scope.userId !== identity.userId ||
        scope.organizationId !== identity.organizationId
      ) {
        done([]);
        return;
      }
      const request = tx
        .objectStore("bundles")
        .index("partition")
        .getAll([identity.userId, identity.organizationId]);
      request.onsuccess = () =>
        done(request.result.filter((record) => record.schemaVersion === 1));
    };
  });
  return started === marker() && identity.epoch === currentEpoch()
    ? records
    : [];
}
/** @param {Identity} identity @param {Bundle} bundle */
export async function saveBundle(identity, bundle) {
  if (
    bundle.schemaVersion !== 1 ||
    bundle.userId !== identity.userId ||
    bundle.organizationId !== identity.organizationId
  )
    throw new Error("identity_changed");
  await transaction("readwrite", (tx) => {
    const request = tx.objectStore("meta").get("active");
    request.onsuccess = () => {
      const scope = request.result;
      if (
        !validScope(scope) ||
        scope.userId !== identity.userId ||
        scope.organizationId !== identity.organizationId ||
        scope.epoch !== identity.epoch ||
        !scope.assignments?.includes(bundle.visit.id)
      ) {
        tx.abort();
        return;
      }
      tx.objectStore("bundles").put(bundle);
    };
  });
  if (identity.epoch !== currentEpoch()) throw new Error("identity_changed");
  notifyChange();
}
/** @param {Identity} identity @param {string} visitId */
export async function removeBundle(identity, visitId) {
  await transaction("readwrite", (tx) => {
    const request = tx.objectStore("meta").get("active");
    request.onsuccess = () => {
      const scope = request.result;
      if (
        !validScope(scope) ||
        scope.userId !== identity.userId ||
        scope.organizationId !== identity.organizationId ||
        scope.epoch !== identity.epoch
      ) {
        tx.abort();
        return;
      }
      tx.objectStore("bundles").delete([
        identity.userId,
        identity.organizationId,
        visitId,
      ]);
    };
  });
  notifyChange();
}
