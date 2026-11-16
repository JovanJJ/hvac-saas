"use client";
import { useActionState } from "react";
import { issueReport } from "./actions";
export function IssueForm({
  visitId,
  version,
  operationId,
}: {
  visitId: string;
  version: number;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(issueReport, {});
  return (
    <form
      action={action}
      className="card my-5"
      aria-label="Izdavanje izveštaja"
    >
      <h2>Izdavanje izveštaja</h2>
      <p>
        Izdavanjem se zaključavaju podaci, nalazi i fotografije ove revizije.
        Pregledajte sadržaj za klijenta pre izdavanja.
      </p>
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="operationId" value={operationId} />
      {state.message && (
        <p role="alert" className="my-4 font-semibold">
          {state.message}
        </p>
      )}
      <button type="submit" className="button primary mt-4" disabled={pending}>
        {pending ? "Izdavanje…" : "Izdaj izveštaj"}
      </button>
    </form>
  );
}
