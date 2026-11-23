"use client";
import { useActionState, useId, useState } from "react";
import { billingAction } from "./actions";
import type { BillingDetail } from "./model";
export function BillingForm({ detail, operationId }: { detail: BillingDetail; operationId: string }) {
  const id = useId();
  const [base] = useState({ version: detail.billing.version, visitVersion: detail.visitVersion, operationId });
  const [state, action, pending] = useActionState(billingAction, {});
  return (
    <form action={action} aria-label="Oznaka za proveru naplate" className="card my-5 space-y-4" onReset={event => event.preventDefault()}>
      <h2>Oznaka za proveru naplate</h2>
      <input type="hidden" name="visitId" value={detail.visitId} />
      <input type="hidden" name="version" value={base.version} />
      <input type="hidden" name="visitVersion" value={base.visitVersion} />
      <input type="hidden" name="operationId" value={base.operationId} />
      <label htmlFor={`${id}-note`}>Interna beleška o proveri</label>
      <textarea id={`${id}-note`} name="note" required minLength={1} maxLength={2000} defaultValue="" />
      {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="button primary" name="ready" value="true" disabled={pending || state.success}>
          {detail.billing.ready ? "Potvrdi ponovnu proveru" : "Označi spremno za proveru naplate"}
        </button>
        {detail.billing.ready && <button className="button secondary" name="ready" value="false" disabled={pending || state.success}>Ukloni oznaku spremnosti</button>}
      </div>
      {state.success && <a href={`/office/handover/${detail.visitId}`}>Učitaj sačuvano stanje</a>}
    </form>
  );
}
