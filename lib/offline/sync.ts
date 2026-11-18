import { syncPhotos } from "./photo-sync";
import {
  activeIdentity,
  verifyIdentity,
  listBundles,
  prepareSync,
  hasReplayConflict,
  acknowledgeSync,
  recordSyncFailure,
  lockIdentity,
  notifyChange,
} from "@/lib/offline/storage";
import type { OfflineIdentity } from "@/features/offline/model";
import type { SyncResult } from "@/features/offline/sync-model";
export const syncEvent = "teren-sync-status";
let running: Promise<string> | null = null;
const same = (a: OfflineIdentity | null, b: OfflineIdentity) =>
  a?.userId === b.userId &&
  a.organizationId === b.organizationId &&
  a.epoch === b.epoch;
export function syncDevice(): Promise<string> {
  if (running) return running;
  running = run().finally(() => {
    running = null;
  });
  return running;
}
async function run() {
  let confirmed = 0,
    retainedPhotos = false,
    retainedOperations = false;
  const initial = await activeIdentity();
  if (!initial)
    throw new Error("Povežite se i potvrdite nalog na ekranu Danas.");
  let identity: OfflineIdentity;
  try {
    identity = await verifyIdentity();
  } catch {
    throw new Error(
      "Sesija ili pristup nisu potvrđeni. Povežite se i prijavite istim nalogom; lokalni rad je zadržan.",
    );
  }
  if (!same(initial, identity))
    throw new Error(
      "Nalog ili radni prostor je promenjen. Slanje je zaustavljeno.",
    );
  const bundles = await listBundles(identity);
  for (const bundle of bundles) {
    let photoPassDone = false;
    // Bound one foreground pass. Further work can be resumed with the same durable operations.
    for (let batch = 0; batch < 20; batch++) {
      if (!same(await activeIdentity(), identity))
        throw new Error("Nalog je promenjen. Slanje je zaustavljeno.");
      if (await hasReplayConflict(identity, bundle.visit.id)) {
        retainedOperations = true;
        break;
      }
      const operations = await prepareSync(identity, bundle.visit.id);
      if (!operations.length) {
        if (!photoPassDone) {
          photoPassDone = true;
          const photos = await syncPhotos(identity, bundle.visit.id);
          confirmed += photos.confirmed;
          retainedPhotos ||= photos.retained;
          if (photos.confirmed) continue;
        }
        break;
      }
      notifyChange({ kind: "sync-attempt", visitId: bundle.visit.id });
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 20000);
      let response: Response;
      try {
        response = await fetch("/api/field/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            userId: identity.userId,
            organizationId: identity.organizationId,
            epoch: identity.epoch,
            operations,
          }),
        });
      } catch {
        throw new Error(
          "Veza je prekinuta. Nepotvrđene operacije su zadržane za bezbedan ponovni pokušaj.",
        );
      } finally {
        clearTimeout(timer);
      }
      if (!same(await activeIdentity(), identity))
        throw new Error(
          "Nalog je promenjen. Potvrde nisu primenjene na drugi nalog.",
        );
      if (response.status === 401) {
        await lockIdentity(true);
        throw new Error(
          "Sesija je istekla. Prijavite se ponovo istim nalogom; nacrti su zadržani.",
        );
      }
      if (!response.ok)
        throw new Error(
          "Slanje nije potvrđeno. Proverite vezu i nalog, pa pokušajte ponovo.",
        );
      const body = (await response.json()) as { results: SyncResult[] };
      if (!Array.isArray(body.results))
        throw new Error("Server nije potvrdio slanje. Operacije su zadržane.");
      let failed = false;
      for (const operation of operations) {
        const result = body.results.find(
          (r) => r.operationId === operation.operationId,
        );
        if (result?.status === 200 && result.acknowledgement) {
          try {
            await acknowledgeSync(identity, operation, result.acknowledgement);
          } catch {
            throw new Error(
              "Potvrda nije sačuvana na telefonu. Operacija je zadržana za bezbedan ponovni pokušaj.",
            );
          }
          confirmed++;
        } else {
          if (result)
            await recordSyncFailure(
              identity,
              operation,
              result.status,
              result.error || "invalid_input",
            );
          failed = true;
        }
      }
      if (body.results.some((r) => r.status >= 500))
        throw new Error(
          "Server trenutno nije dostupan. Potvrđene izmene su sačuvane; preostale čekaju ponovni pokušaj.",
        );
      if (failed) {
        retainedOperations = true;
        break;
      }
    }
  }
  if (retainedOperations)
    return `Potvrđeno na serveru: ${confirmed}. Preostale operacije su zadržane; otvorite usaglašavanje u poseti.`;
  if (retainedPhotos)
    return `Potvrđeno na serveru: ${confirmed}. Fotografije koje čekaju ili imaju grešku su zadržane; predaja ih čeka.`;
  return confirmed
    ? `Potvrđeno na serveru: ${confirmed}.`
    : "Nema spremnih operacija za slanje. Pripremite nacrte i proverite zadržane greške.";
}
