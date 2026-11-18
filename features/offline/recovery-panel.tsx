"use client";
import { useEffect, useState } from "react";
import type { OfflineBundle, OfflineIdentity } from "./model";
import {
  outcomeLabels,
  actionLabels,
  readingLabels,
} from "@/features/visits/model";
import {
  toDraftValues,
  type DraftValues,
  type FieldDraft,
} from "./draft-model";
import type { Submission, SyncOperation } from "./sync-model";
import type { RecoveryContext } from "./recovery-model";
import { listDrafts, getSubmission, changeEvent } from "@/lib/offline/storage";
import { listPhotos } from "@/lib/offline/photo-storage";
import {
  readRecovery,
  resolveOperation,
  draftOperation,
  submissionOperation,
} from "@/lib/offline/recovery";
export function RecoveryPanel({
  identity,
  bundle,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
}) {
  const [drafts, setDrafts] = useState<FieldDraft[]>([]),
    [submission, setSubmission] = useState<Submission | null>(null),
    [photoProblem, setPhotoProblem] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [d, s, p] = await Promise.all([
          listDrafts(identity, bundle.visit.id),
          getSubmission(identity, bundle.visit.id),
          listPhotos(identity, bundle.visit.id),
        ]);
        if (mounted) {
          setDrafts(
            d.filter(
              (d) => d.errorStatus === 409 || d.error === "visit_locked",
            ),
          );
          setSubmission(s?.errorStatus === 409 ? s : null);
          setPhotoProblem(
            p.some(
              (p) =>
                p.errorStatus === 409 ||
                p.errorStatus === 403 ||
                p.errorStatus === 404,
            ),
          );
        }
      } catch {}
    };
    void load();
    window.addEventListener(changeEvent, load);
    window.addEventListener("storage", load);
    return () => {
      mounted = false;
      window.removeEventListener(changeEvent, load);
      window.removeEventListener("storage", load);
    };
  }, [identity, bundle.visit.id]);
  if (!drafts.length && !submission && !photoProblem) return null;
  return (
    <section className="card" aria-label="Usaglašavanje">
      <h2>Potrebno je usaglašavanje</h2>
      <p>
        Lokalni rad je zadržan. Učitajte trenutno stanje uz vezu i pregledajte
        razlike pre nastavka.
      </p>
      {drafts.map((d) => (
        <OperationReview
          key={d.operationId}
          identity={identity}
          bundle={bundle}
          operation={draftOperation(d)}
          draft={d}
        />
      ))}
      {submission && (
        <OperationReview
          key={submission.operationId}
          identity={identity}
          bundle={bundle}
          operation={submissionOperation(submission)}
        />
      )}
      {photoProblem && !drafts.length && !submission && (
        <OperationReview identity={identity} bundle={bundle} operation={null} />
      )}
    </section>
  );
}
function details(value: DraftValues, staff: OfflineBundle["visit"]["staff"]) {
  return {
    Ishod: outcomeLabels[value.outcome],
    Radovi: value.work,
    Nalaz: value.finding,
    "Bez pristupa": value.noAccessReason,
    "Interna beleška": value.internalNote,
    Merenja: value.readings
      .map(
        (r) =>
          `${r.kind} · ${r.mode}: ${r.status === "measured" ? `${r.value ?? "—"} ${r.unit}` : readingLabels[r.status]}`,
      )
      .join("; "),
    Materijal: value.parts
      .map((p) => `${p.name}: ${p.quantity} ${p.unit}`)
      .join("; "),
    Radnja: value.followUp
      ? `${actionLabels[value.followUp.kind]} · ${staff.find((s) => s.id === value.followUp!.ownerId)?.label ?? value.followUp.ownerId ?? ""} · ${value.followUp.dueDate || "Bez roka"} · ${value.followUp.customerAction}`
      : "Bez radnje",
  };
}
function Comparison({
  local,
  server,
  staff,
}: {
  local: DraftValues;
  server: DraftValues;
  staff: OfflineBundle["visit"]["staff"];
}) {
  const left = details(local, staff),
    right = details(server, staff);
  return (
    <table className="comparison">
      <caption>Poređenje sa trenutnim stanjem</caption>
      <thead>
        <tr>
          <th>Podatak</th>
          <th>Na telefonu</th>
          <th>Na serveru</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(left).map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value || "—"}</td>
            <td>{right[label as keyof typeof right] || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function OperationReview({
  identity,
  bundle,
  operation,
  draft,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
  operation: SyncOperation | null;
  draft?: FieldDraft;
}) {
  const [context, setContext] = useState<RecoveryContext | null>(null),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    setMessage("");
    setReviewed(false);
    setContext(null);
    try {
      setContext(await readRecovery(identity, bundle.visit.id, operation));
    } catch (error) {
      setMessage(
        error instanceof DOMException || error instanceof TypeError
          ? "Povežite se i ponovo učitajte poređenje. Lokalni rad je zadržan."
          : error instanceof Error
            ? error.message
            : "Poređenje nije dostupno. Lokalni rad je zadržan.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function choose(choice: "local" | "server") {
    if (!context || !operation) return;
    setBusy(true);
    try {
      await resolveOperation(
        identity,
        context,
        operation,
        draft?.revision ?? null,
        choice,
      );
    } catch (error) {
      setMessage(
        error instanceof DOMException ||
          (error instanceof Error && error.message.startsWith("storage_"))
          ? "Usaglašavanje nije sačuvano. Prethodni nacrt je zadržan; proverite memoriju i pokušajte ponovo."
          : error instanceof Error
            ? error.message
            : "Usaglašavanje nije sačuvano. Prethodni nacrt je zadržan.",
      );
    } finally {
      setBusy(false);
    }
  }
  const current = context?.bundle.visit,
    editable = current && ["scheduled", "in_progress"].includes(current.status);
  return (
    <article
      className="line-item"
      aria-label={
        draft
          ? `Sukob ${bundle.visit.items.find((i) => i.id === draft.itemId)?.code ?? "sistema"}`
          : operation
            ? "Sukob predaje"
            : "Stanje fotografija"
      }
    >
      <h3>
        {draft
          ? `Sistem ${bundle.visit.items.find((i) => i.id === draft.itemId)?.code ?? ""}`
          : operation
            ? "Predaja posete"
            : "Fotografije i pristup"}
      </h3>
      <button type="button" disabled={busy} onClick={() => void load()}>
        {busy ? "Provera…" : "Učitaj trenutno stanje"}
      </button>
      {context && (
        <>
          <p>
            Verzija na telefonu:{" "}
            {draft?.baseItemVersion ?? bundle.visit.version}. Trenutna verzija
            posete na serveru: {current!.version} ·{" "}
            {
              {
                scheduled: "Zakazano",
                in_progress: "U toku",
                submitted: "Predato kancelariji",
                issued: "Izdat izveštaj",
              }[current!.status]
            }
            .
          </p>
          {!editable && (
            <p role="alert">
              Poseta više nije otvorena za izmene. Lokalni rad je zadržan;
              predati ili izdati podaci se ne prepisuju.
            </p>
          )}
          {context.operation?.status === "mismatch" && (
            <p role="alert">
              Stara operacija ima drugačiju potvrdu. Nije bezbedno ponoviti je
              sa izmenjenim podacima.
            </p>
          )}
          {current!.items
            .filter((i) => !draft || i.id === draft.itemId)
            .map((item) => {
              const old = bundle.visit.items.find((i) => i.id === item.id);
              return (
                <section key={item.id}>
                  <h4>
                    {item.code} · {item.room}
                  </h4>
                  <p>
                    Verzija sistema na serveru: {item.version}. Uneo:{" "}
                    {item.enteredByLabel ?? "—"} · {item.enteredAt ?? "—"}
                  </p>
                  <Comparison
                    local={
                      draft?.values ??
                      (old ? toDraftValues(old) : toDraftValues(item))
                    }
                    server={toDraftValues(item)}
                    staff={current!.staff}
                  />
                  {item.followUp?.managedAt && (
                    <p>
                      Radnjom upravlja kancelarija. Nastavak lokalnog nacrta
                      zadržaće njene trenutne podatke.
                    </p>
                  )}
                </section>
              );
            })}
          <p>
            Fotografije prema kopiji na telefonu: {bundle.photoCount}. Na
            serveru:{" "}
            {context.photos.filter((p) => p.state === "verified").length}{" "}
            potvrđenih,{" "}
            {context.photos.filter((p) => p.state === "reserved").length}{" "}
            nepotvrđenih.
          </p>
          <ul>
            {context.photos.map((p) => (
              <li key={p.id}>
                {p.caption} ·{" "}
                {p.visibility === "customer" ? "Za klijenta" : "Interno"} ·{" "}
                {p.state === "verified" ? "Potvrđeno" : "Čeka potvrdu"}
              </li>
            ))}
          </ul>
          {operation && (
            <>
              <p>
                Prethodna operacija se neće menjati. Izbor je zabeležen na
                telefonu; novi unos koristi novu operaciju i pregledanu verziju.
                Postojeća lokalna predaja biće zamenjena ili otkazana.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{" "}
                Pregledao/la sam obe verzije i fotografije.
              </label>
              <div>
                {editable && context.operation?.status === "absent" && (
                  <button
                    type="button"
                    disabled={!reviewed || busy}
                    onClick={() => void choose("local")}
                  >
                    {draft ? "Nastavi lokalni nacrt" : "Pripremi novu predaju"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!reviewed || busy}
                  onClick={() => void choose("server")}
                >
                  Zadrži podatke sa servera
                </button>
              </div>
            </>
          )}
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </article>
  );
}
