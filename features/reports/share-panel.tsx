"use client";
import { useActionState, useState } from "react";
import { createReportLink, revokeReportLink } from "./link-actions";
import type { ReportLink } from "./link-model";
function RevokeLink({
  link,
  revisionId,
}: {
  link: ReportLink;
  revisionId: string;
}) {
  const [state, action, pending] = useActionState(revokeReportLink, {});
  return (
    <form action={action}>
      <input type="hidden" name="linkId" value={link.id} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <button className="button" disabled={pending}>
        {pending ? "Opozivanje…" : "Opozovi link"}
      </button>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function SharePanel({
  revisionId,
  links,
  token,
  operationId,
  timeZone,
}: {
  revisionId: string;
  links: ReportLink[];
  token: string;
  operationId: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(createReportLink, {});
  const [copyMessage, setCopyMessage] = useState("");
  const activeResult =
    state.url &&
    links.some(
      (link) => link.id === state.linkId && !link.revokedAt && !link.expired,
    );
  return (
    <section className="card my-5" aria-label="Deljenje izveštaja">
      <h2>Link za klijenta</h2>
      <p>
        Link otvara samo ovu reviziju, bez prijavljivanja. Pošaljite ga klijentu
        ručno. Otvaranje i preuzimanje ne potvrđuju prijem.
      </p>
      <form action={action} className="my-4">
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="operationId" value={operationId} />
        <label className="block">
          Važenje linka
          <select name="days" defaultValue="7">
            <option value="1">1 dan</option>
            <option value="7">7 dana</option>
            <option value="30">30 dana</option>
            <option value="90">90 dana</option>
          </select>
        </label>
        <button className="button primary mt-3" disabled={pending}>
          {pending ? "Kreiranje…" : "Napravi link za klijenta"}
        </button>
      </form>
      {state.message && <p role="alert">{state.message}</p>}
      {activeResult && (
        <div className="my-4">
          <label className="block">
            Link za kopiranje
            <input
              readOnly
              value={state.url}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            className="button mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.url!);
                setCopyMessage("Link je kopiran.");
              } catch {
                setCopyMessage("Izaberite i kopirajte link iz polja iznad.");
              }
            }}
          >
            Kopiraj link
          </button>
          {copyMessage && <p role="status">{copyMessage}</p>}
          <p>
            Sačuvajte link sada. Posle ponovnog otvaranja stranice možete
            napraviti novi link.
          </p>
        </div>
      )}
      <h3>Kreirani linkovi</h3>
      {!links.length && <p>Nema kreiranih linkova.</p>}
      <ul className="list-none p-0">
        {links.map((link, index) => (
          <li className="my-4 border-t pt-3" key={link.id}>
            <p>
              Link {links.length - index} ·{" "}
              {link.revokedAt
                ? "Opozvan"
                : link.expired
                  ? "Istekao"
                  : "Aktivan"}
            </p>
            <p>
              Važi do:{" "}
              {new Date(link.expiresAt).toLocaleString("sr-Latn-RS", {
                timeZone,
              })}
            </p>
            {!link.revokedAt && !link.expired && (
              <RevokeLink link={link} revisionId={revisionId} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
