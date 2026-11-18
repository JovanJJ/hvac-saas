"use client";
import { useEffect, useState } from "react";
import {
  activeIdentity,
  fetchPrivate,
  changeEvent,
  listBundles,
  removeBundle,
  saveBundle,
  verifyIdentity,
} from "@/lib/offline/storage";
import { installShell, shellReady } from "@/lib/offline/shell";
import type { OfflineBundle, OfflineIdentity } from "./model";
export function DownloadControl({
  visitId,
  userId,
  organizationId,
}: {
  visitId: string;
  userId: string;
  organizationId: string;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [editable, setEditable] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const identity = await activeIdentity();
        const matching =
          identity?.userId === userId &&
          identity?.organizationId === organizationId;
        const bundles: OfflineBundle[] = matching
          ? await listBundles(identity!)
          : [];
        const bundle = bundles.find((b) => b.visit.id === visitId);
        const shell = !!bundle && (await shellReady());
        if (active) {
          setSaved(bundle?.downloadedAt || null);
          setReady(shell);
          setEditable(
            !!bundle &&
              ["scheduled", "in_progress"].includes(bundle.visit.status),
          );
        }
      } catch {
        if (active) {
          setSaved(null);
          setReady(false);
          setMessage(
            "Memorija telefona nije dostupna. Poseta nije spremna za rad bez veze.",
          );
          setFailed(true);
        }
      }
    }
    void load();
    window.addEventListener(changeEvent, load);
    window.addEventListener("storage", load);
    return () => {
      active = false;
      window.removeEventListener(changeEvent, load);
      window.removeEventListener("storage", load);
    };
  }, [visitId, userId, organizationId]);
  async function change(remove: boolean) {
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const identity = remove ? await activeIdentity() : await verifyIdentity();
      if (
        !identity ||
        identity.userId !== userId ||
        identity.organizationId !== organizationId
      )
        throw new Error("identity_changed");
      if (remove) {
        await removeBundle(identity, visitId);
        setSaved(null);
        setReady(false);
        setMessage("Poseta je uklonjena sa telefona.");
      } else {
        await installShell();
        const response = await fetchPrivate(`/api/field/visits/${visitId}`);
        if (response.status === 404 || response.status === 401) {
          await removeBundle(identity, visitId);
          throw new Error("visit_unavailable");
        }
        if (!response.ok) throw new Error("download_failed");
        const payload = (await response.json()) as {
          identity: OfflineIdentity;
          bundle: OfflineBundle;
        };
        if (payload.identity.epoch !== identity.epoch)
          throw new Error("identity_changed");
        await saveBundle(identity, payload.bundle);
        setSaved(payload.bundle.downloadedAt);
        setReady(true);
        setEditable(
          ["scheduled", "in_progress"].includes(payload.bundle.visit.status),
        );
        setMessage("Poseta je spremna za pregled bez veze.");
      }
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error && error.message === "local_work_pending"
          ? "Poseta ima neposlate nacrte. Sačuvani su na telefonu; otvorite ih pre osvežavanja ili uklanjanja kopije."
          : error instanceof Error && error.message === "offline_unsupported"
            ? "Za rad bez veze potreban je podržan pregledač i HTTPS veza (ili localhost)."
            : remove
              ? "Uklanjanje nije uspelo. Kopija je zadržana; pokušajte ponovo."
              : "Preuzimanje nije uspelo. Proverite vezu, slobodnu memoriju i pristup poseti. Offline spremnost nije potvrđena.",
      );
      if (
        !remove &&
        !(error instanceof Error && error.message === "local_work_pending")
      )
        setReady(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-5 space-y-3" aria-label="Dostupnost bez veze">
      <p>
        {ready
          ? editable
            ? "Dostupno bez veze · lokalni unos"
            : "Dostupno bez veze · samo pregled"
          : saved
            ? "Kopija je sačuvana; offline pristup treba obnoviti."
            : "Nije preuzeto za rad bez veze."}
      </p>
      {saved && (
        <p className="text-sm">
          Preuzeto: {new Date(saved).toLocaleString("sr-Latn-RS")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() => change(false)}
        >
          {pending
            ? "Obrada…"
            : saved
              ? "Preuzmi ponovo"
              : "Preuzmi za rad bez veze"}
        </button>
        {saved && (
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => change(true)}
          >
            Ukloni sa telefona
          </button>
        )}
        {ready && (
          <a
            href={`/offline/v2/index.html?visit=${visitId}`}
            className="button secondary"
          >
            Otvori preuzetu posetu
          </a>
        )}
      </div>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </section>
  );
}
