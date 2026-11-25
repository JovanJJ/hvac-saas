"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { retryReport } from "./actions";
import { renderLabels } from "./status-labels";
import type { ReportRevision } from "./model";
export function ReportRenderStatus({
  revision,
  operationId,
}: {
  revision: ReportRevision;
  operationId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(retryReport, {});
  useEffect(() => {
    if (!["queued", "rendering"].includes(revision.renderState)) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [revision.renderState, router]);
  return (
    <section className="office-state" aria-label="Izrada PDF-a">
      <h3>Izrada i arhiva PDF-a</h3>
      <p role="status">{renderLabels[revision.renderState]}</p>
      {(revision.renderState === "queued" ||
        revision.renderState === "rendering") && (
        <p>Pregled se automatski osvežava. Pokušaj: {revision.attempts}/3. Po završetku možete preuzeti PDF i napraviti link za klijenta.</p>
      )}
      {revision.renderState === "ready" && revision.artifact && <p>Arhivirani PDF je spreman. Preuzimanje ne beleži potvrdu prijema.</p>}
      {revision.renderState === "ready" && revision.artifact && <p><a className="button secondary" href={`/api/office/reports/${revision.id}/pdf?view=preview`} target="_blank" rel="noreferrer">Otvori PDF pregled (novi tab)</a></p>}
      {revision.renderState === "ready" && revision.artifact && (
        <a
          className="button primary"
          href={`/api/office/reports/${revision.id}/pdf`}
        >
          Preuzmi PDF
        </a>
      )}
      {revision.renderState === "failed" && (
        <>
          <p>Podaci izveštaja su sačuvani. Ponovite izradu iste revizije.</p>
          <form action={action}>
            <input type="hidden" name="revisionId" value={revision.id} />
            <input type="hidden" name="operationId" value={operationId} />
            <button className="button primary" disabled={pending}>
              {pending ? "Pokretanje…" : "Ponovi izradu PDF-a"}
            </button>
          </form>
        </>
      )}
      {state.message && <p role="alert">{state.message}</p>}
    </section>
  );
}
