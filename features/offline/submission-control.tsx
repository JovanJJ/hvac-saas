"use client";
import { useEffect, useState } from "react";
import type { OfflineIdentity } from "./model";
import type { Submission } from "./sync-model";
import { syncMessages } from "./sync-model";
import {
  getSubmission,
  queueSubmission,
  cancelSubmission,
  changeEvent,
} from "@/lib/offline/storage";
export function SubmissionControl({
  identity,
  visitId,
}: {
  identity: OfflineIdentity;
  visitId: string;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void getSubmission(identity, visitId)
        .then((s) => {
          if (mounted) setSubmission(s);
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
  }, [identity, visitId]);
  async function change(cancel: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (cancel) await cancelSubmission(identity, visitId);
      else await queueSubmission(identity, visitId);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Predaja nije sačuvana na telefonu.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="Predaja posete">
      <h2>Predaja kancelariji</h2>
      <p className="field-help">Sačuvano na telefonu → pripremljeno za slanje → potvrđeno na serveru → predato kancelariji. Fotografije i nacrti moraju biti potvrđeni pre predaje.</p>
      {submission ? (
        <>
          <p role="status">
            Predaja čeka slanje i potvrdu servera. Poseta još nije predata.
          </p>
          {submission.error && (
            <p role="alert">
              {syncMessages[submission.error] ??
                "Predaja nije potvrđena. Podaci su zadržani."}
            </p>
          )}
          {(!submission.attemptedAt || submission.errorStatus === 422) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void change(true)}
            >
              Otkaži lokalnu predaju
            </button>
          )}
        </>
      ) : (
        <>
          <p>
            Pregledajte sve sisteme i pripremite svaki nacrt za slanje. Predaja
            će sačekati potvrdu svih izmena.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void change(false)}
          >
            Pripremi predaju kancelariji
          </button>
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
