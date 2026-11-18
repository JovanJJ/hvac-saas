"use client";
import { useEffect, useState } from "react";
import type { OfflineIdentity } from "./model";
import type { RetainedWork } from "./recovery-model";
import { retainedWork, restoreRetainedWork } from "@/lib/offline/recovery";
import { changeEvent } from "@/lib/offline/storage";
export function RetainedWorkPanel({ identity }: { identity: OfflineIdentity }) {
  const [records, setRecords] = useState<RetainedWork[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void retainedWork(identity)
        .then((r) => {
          if (mounted) setRecords(r);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(changeEvent, load);
    window.addEventListener("storage", load);
    return () => {
      mounted = false;
      window.removeEventListener(changeEvent, load);
      window.removeEventListener("storage", load);
    };
  }, [identity]);
  async function restore(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await restoreRetainedWork(identity, id);
      setMessage(
        "Pristup je potvrđen. Otvorite posetu i proverite eventualno usaglašavanje.",
      );
    } catch (error) {
      setMessage(
        error instanceof DOMException || error instanceof TypeError
          ? "Povežite se i ponovo proverite pristup. Lokalni rad je zadržan."
          : error instanceof Error
            ? error.message
            : "Pristup nije potvrđen. Lokalni rad je zadržan.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!records.length) return null;
  return (
    <section className="card" aria-label="Zadržan lokalni rad">
      <h2>Zadržan rad · pristup nije potvrđen</h2>
      <p>
        Nacrti i fotografije nisu obrisani. Ne prikazuju se i neće se slati dok
        isti nalog ponovo ne dobije pristup poseti.
      </p>
      {records.map((r) => (
        <article key={r.visitId}>
          <p>
            Poseta {r.visitId.slice(0, 8)} · Nacrti: {r.drafts} · Fotografije:{" "}
            {r.photos} · Predaja: {r.submission ? "Čeka" : "Nije pripremljena"}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void restore(r.visitId)}
          >
            Proveri pristup ponovo
          </button>
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
