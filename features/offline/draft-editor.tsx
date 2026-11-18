"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  outcomeLabels,
  actionLabels,
  readingLabels,
} from "@/features/visits/model";
import { syncMessages } from "./sync-model";
import type { OfflineBundle, OfflineIdentity } from "./model";
import {
  getSubmission,
  saveDraft,
  changeDraft,
  toDraftValues,
  changeEvent,
  type DraftValues,
  type FieldDraft,
} from "@/lib/offline/storage";
type Item = OfflineBundle["visit"]["items"][number];
function Text({
  label,
  value,
  onChange,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  numeric?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          inputMode={numeric ? "decimal" : undefined}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(choices).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
export function DraftEditor({
  identity,
  bundle,
  item,
  draft,
  onPersist,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
  item: Item;
  draft?: FieldDraft;
  onPersist: (draft: FieldDraft | null, itemId: string) => void;
}) {
  const [values, setValues] = useState<DraftValues>(
    () => draft?.values ?? toDraftValues(item),
  );
  const [localRecord, setRecord] = useState(draft);
  const record =
    draft && draft.revision >= (localRecord?.revision ?? 0)
      ? draft
      : localRecord;
  const [state, setState] = useState<"ready" | "saving" | "saved" | "failed">(
    "ready",
  );
  const [error, setError] = useState("");
  const revision = useRef(draft?.revision ?? 0),
    generation = useRef(0),
    chain = useRef(Promise.resolve());
  const [stale, setStale] = useState(false);
  const queued = record?.status === "queued";
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void getSubmission(identity, bundle.visit.id)
        .then((s) => {
          if (mounted) setSubmitting(!!s);
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
  }, [identity, bundle.visit.id]);
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key !== changeEvent || !event.newValue) return;
      try {
        const detail = JSON.parse(event.newValue);
        if (
          detail.kind === "draft" &&
          detail.visitId === bundle.visit.id &&
          detail.itemId === item.id &&
          detail.revision !== revision.current
        )
          setStale(true);
      } catch {}
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [bundle.visit.id, item.id]);
  function patch(value: Partial<DraftValues>) {
    const next = { ...values, ...value };
    setValues(next);
    setState("saving");
    setError("");
    const sequence = ++generation.current;
    chain.current = chain.current.then(async () => {
      try {
        const saved = await saveDraft(
          identity,
          bundle.visit.id,
          item.id,
          next,
          revision.current,
        );
        revision.current = saved.revision;
        setRecord(saved);
        onPersist(saved, item.id);
        if (generation.current === sequence) setState("saved");
      } catch (error) {
        if (generation.current === sequence) {
          setState("failed");
          setError(
            error instanceof Error && error.message === "stale_draft"
              ? "Drugi prozor je promenio ovaj nacrt. Ovaj unos nije sačuvan; otvorite sačuvani nacrt ponovo."
              : "Unos nije sačuvan na telefonu. Proverite memoriju i nalog; prethodni nacrt je zadržan.",
          );
        }
      }
    });
  }
  async function action(kind: "queue" | "edit" | "discard") {
    if (
      kind === "discard" &&
      !window.confirm("Obrisati neposlate izmene ovog sistema sa telefona?")
    )
      return;
    await chain.current;
    setState("saving");
    setError("");
    try {
      const saved = await changeDraft(
        identity,
        bundle.visit.id,
        item.id,
        revision.current,
        kind,
      );
      revision.current = saved?.revision ?? 0;
      setRecord(saved ?? undefined);
      onPersist(saved, item.id);
      if (!saved) setValues(toDraftValues(item));
      setState(saved ? "saved" : "ready");
    } catch (error) {
      setState(record ? "saved" : "ready");
      setError(
        error instanceof Error && error.message.startsWith("Proverite ")
          ? error.message
          : "Promena nije sačuvana. Sačuvani nacrt je zadržan; otvorite ga ponovo.",
      );
      if (error instanceof Error && error.message === "stale_draft")
        setStale(true);
    }
  }
  return (
    <section className="card" aria-label={`Unos ${item.code}`}>
      <h2>
        {item.code} · {item.room}
      </h2>
      <p>
        {item.model} · {item.serial}
      </p>
      <p role="status">
        {state === "saving"
          ? "Čuvanje na telefonu…"
          : state === "failed"
            ? "Postoje nesačuvane izmene."
            : queued
              ? "Čeka slanje · nije potvrđeno na serveru."
              : record
                ? "Sačuvano na telefonu · nije poslato."
                : item.confirmedAt
                  ? "Potvrđeno na serveru · nema lokalnih izmena."
                  : "Preuzeto sa servera · nema lokalnih izmena."}
      </p>
      {record?.error && (
        <p role="alert">
          {syncMessages[record.error] ?? "Unos je odbijen. Nacrt je zadržan."}
        </p>
      )}
      {submitting && (
        <p>Izmena čeka završetak ili otkazivanje lokalne predaje.</p>
      )}
      {record && (
        <p className="muted">
          Uneo na telefonu: {record.actorLabel} ·{" "}
          {new Date(record.updatedAt).toLocaleString("sr-Latn-RS", {
            timeZone: bundle.visit.timeZone,
          })}
        </p>
      )}
      {stale && (
        <p role="alert">
          Drugi prozor je promenio ovaj nacrt. Otvorite sačuvani nacrt ponovo
          pre nastavka.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {state === "failed" && !stale && !queued && (
        <button type="button" onClick={() => patch({})}>
          Ponovi čuvanje
        </button>
      )}
      <fieldset disabled={queued || stale || submitting}>
        <legend>Podaci sistema</legend>
        <Choice
          label="Ishod"
          value={values.outcome}
          choices={outcomeLabels}
          onChange={(outcome) =>
            patch({ outcome: outcome as DraftValues["outcome"] })
          }
        />
        <Text
          label="Obavljeni radovi"
          value={values.work}
          onChange={(work) => patch({ work })}
          multiline
        />
        <Text
          label="Nalaz"
          value={values.finding}
          onChange={(finding) => patch({ finding })}
          multiline
        />
        <Text
          label="Razlog bez pristupa"
          value={values.noAccessReason}
          onChange={(noAccessReason) => patch({ noAccessReason })}
          multiline
        />
        <Text
          label="Interna beleška"
          value={values.internalNote}
          onChange={(internalNote) => patch({ internalNote })}
          multiline
        />
        <h3>Merenja</h3>
        <p>Prazna izmerena vrednost nije nula. Decimalni zarez je dozvoljen.</p>
        {values.readings.map((reading, index) => (
          <fieldset
            key={index}
            className="line-item"
            aria-label={`Merenje ${index + 1}`}
          >
            <legend>Merenje {index + 1}</legend>
            {(["kind", "mode", "unit"] as const).map((key, i) => (
              <Text
                key={key}
                label={["Vrsta merenja", "Režim rada", "Jedinica"][i]}
                value={reading[key]}
                onChange={(text) =>
                  patch({
                    readings: values.readings.map((r, n) =>
                      n === index ? { ...r, [key]: text } : r,
                    ),
                  })
                }
              />
            ))}
            <Choice
              label="Stanje merenja"
              value={reading.status}
              choices={readingLabels}
              onChange={(status) =>
                patch({
                  readings: values.readings.map((r, n) =>
                    n === index
                      ? {
                          ...r,
                          status: status as typeof r.status,
                          value: status === "measured" ? (r.value ?? "") : null,
                        }
                      : r,
                  ),
                })
              }
            />
            {reading.status === "measured" && (
              <Text
                label="Izmerena vrednost"
                value={reading.value ?? ""}
                onChange={(value) =>
                  patch({
                    readings: values.readings.map((r, n) =>
                      n === index ? { ...r, value } : r,
                    ),
                  })
                }
                numeric
              />
            )}
            <button
              type="button"
              onClick={() =>
                patch({
                  readings: values.readings.filter((_, n) => n !== index),
                })
              }
            >
              Ukloni merenje {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={values.readings.length >= 10}
          onClick={() =>
            patch({
              readings: [
                ...values.readings,
                {
                  kind: "Temperatura izduva",
                  mode: "Hlađenje",
                  unit: "°C",
                  status: "not_measured",
                  value: null,
                },
              ],
            })
          }
        >
          Dodaj merenje
        </button>
        <h3>Materijal</h3>
        {values.parts.map((part, index) => (
          <fieldset
            key={index}
            className="line-item"
            aria-label={`Materijal ${index + 1}`}
          >
            <legend>Materijal {index + 1}</legend>
            {(["name", "quantity", "unit"] as const).map((key, i) => (
              <Text
                key={key}
                label={
                  ["Naziv materijala", "Količina", "Jedinica materijala"][i]
                }
                value={part[key]}
                numeric={key === "quantity"}
                onChange={(text) =>
                  patch({
                    parts: values.parts.map((p, n) =>
                      n === index ? { ...p, [key]: text } : p,
                    ),
                  })
                }
              />
            ))}
            <button
              type="button"
              onClick={() =>
                patch({ parts: values.parts.filter((_, n) => n !== index) })
              }
            >
              Ukloni materijal {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={values.parts.length >= 20}
          onClick={() =>
            patch({
              parts: [...values.parts, { name: "", quantity: "", unit: "kom" }],
            })
          }
        >
          Dodaj materijal
        </button>
        {item.followUp?.managedAt && (
          <p>
            Ovom radnjom upravlja kancelarija. Njeni podaci ostaju sačuvani.
          </p>
        )}
        <fieldset disabled={!!item.followUp?.managedAt}>
          <legend>Sledeća radnja</legend>
          <Choice
            label="Vrsta radnje"
            value={values.followUp?.kind ?? ""}
            choices={{ "": "Bez radnje", ...actionLabels }}
            onChange={(kind) =>
              patch({
                followUp: kind
                  ? {
                      kind: kind as NonNullable<
                        DraftValues["followUp"]
                      >["kind"],
                      ownerId: values.followUp?.ownerId ?? "",
                      dueDate: values.followUp?.dueDate ?? "",
                      customerAction: values.followUp?.customerAction ?? "",
                    }
                  : null,
              })
            }
          />
          {values.followUp && (
            <>
              <Choice
                label="Odgovorni član tima"
                value={values.followUp.ownerId}
                choices={{
                  "": "Izaberite odgovornu osobu",
                  ...Object.fromEntries(
                    bundle.visit.staff.map((s) => [s.id, s.label]),
                  ),
                }}
                onChange={(ownerId) =>
                  patch({ followUp: { ...values.followUp!, ownerId } })
                }
              />
              <Text
                label="Rok radnje (GGGG-MM-DD)"
                value={values.followUp.dueDate}
                onChange={(dueDate) =>
                  patch({ followUp: { ...values.followUp!, dueDate } })
                }
              />
              <Text
                label="Potrebno od klijenta"
                value={values.followUp.customerAction}
                onChange={(customerAction) =>
                  patch({ followUp: { ...values.followUp!, customerAction } })
                }
                multiline
              />
            </>
          )}
        </fieldset>
      </fieldset>
      {record && (
        <div>
          <button
            type="button"
            disabled={
              state === "saving" ||
              stale ||
              submitting ||
              (!!record.attemptedAt && record.errorStatus !== 422) ||
              (!queued && state === "failed")
            }
            onClick={() => action(queued ? "edit" : "queue")}
          >
            {queued ? "Nastavi izmenu nacrta" : "Pripremi za slanje"}
          </button>
          <button
            type="button"
            disabled={
              state === "saving" || stale || submitting || !!record.attemptedAt
            }
            onClick={() => action("discard")}
          >
            Obriši lokalni nacrt
          </button>
        </div>
      )}
      {queued && (
        <p>Pripremljeno za slanje. Podaci još nisu poslati kancelariji.</p>
      )}
      {stale && (
        <button type="button" onClick={() => window.location.reload()}>
          Ponovo otvori sačuvani nacrt
        </button>
      )}
    </section>
  );
}
