"use client";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { visitCommand } from "./actions";
import {
  actionLabels,
  outcomeLabels,
  readingLabels,
  type VisitBundle,
  type VisitItem,
} from "./model";

function Field({
  label,
  name,
  value = "",
  ...props
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  inputMode?: "decimal";
}) {
  const id = useId();
  return (
    <FormField
      id={id}
      name={name}
      label={label}
      defaultValue={value}
      {...props}
    />
  );
}
function Note({
  label,
  name,
  value = "",
}: {
  label: string;
  name: string;
  value?: string;
}) {
  const id = useId();
  return (
    <div className="my-4">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={name}
        defaultValue={value}
        maxLength={2000}
        rows={3}
        className="w-full rounded border p-3"
      />
    </div>
  );
}
function Status({ message, success }: { message?: string; success?: boolean }) {
  return (
    message && (
      <p role={success ? "status" : "alert"} className="my-4 font-semibold">
        {message}
      </p>
    )
  );
}
export function ItemForm({
  item,
  visit,
  operationId,
}: {
  item: VisitItem;
  visit: VisitBundle;
  operationId: string;
}) {
  const [stableOperationId] = useState(operationId);
  const templateKinds = ["Temperatura izduva", "Struja"];
  const templateReadings = templateKinds.map((kind) =>
    item.readings.find((reading) => reading.kind === kind),
  );
  const additionalReadings = item.readings.filter(
    (reading) => !templateKinds.includes(reading.kind),
  );
  const [partRows, setPartRows] = useState(() =>
    Array.from({ length: Math.max(1, item.parts.length) }, (_, index) => index),
  );
  const nextPart = useRef(partRows.length);
  const [state, action, pending] = useActionState(
    async (
      previous: { message?: string; success?: boolean },
      form: FormData,
    ) => {
      const str = (name: string) => String(form.get(name) ?? "").trim();
      const numeric = (name: string) => {
        const value = str(name).replace(",", ".");
        return /^[-+]?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
      };
      const readings = ["temperature", "current"].map((kind) => ({
        kind: kind === "temperature" ? "Temperatura izduva" : "Struja",
        status: str(kind + "Status"),
        value:
          str(kind + "Status") === "measured" ? numeric(kind + "Value") : null,
        unit: kind === "temperature" ? "°C" : "A",
        mode: str("mode"),
      }));
      const data = {
        itemId: item.id,
        outcome: str("outcome"),
        work: str("work"),
        finding: str("finding"),
        noAccessReason: str("noAccessReason"),
        internalNote: str("internalNote"),
        readings: [...readings, ...additionalReadings],
        parts: partRows
          .filter((index) => str(`partName${index}`))
          .map((index) => ({
            name: str(`partName${index}`),
            quantity: numeric(`quantity${index}`),
            unit: str(`partUnit${index}`),
          })),
        followUp: str("followKind")
          ? {
              kind: str("followKind"),
              ownerId: str("ownerId"),
              dueDate: str("dueDate"),
              customerAction: str("customerAction"),
            }
          : null,
      };
      const command = new FormData();
      for (const [key, value] of Object.entries({
        visitId: visit.id,
        operationId: stableOperationId,
        kind: "save",
        version: String(item.version),
        payload: JSON.stringify(data),
      }))
        command.set(key, value);
      return visitCommand(previous, command);
    },
    {},
  );
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="card my-5"
      aria-label={`Unos ${item.code}`}
      data-version={item.version}
    >
      <h2>
        {item.code} · {item.room}
      </h2>
      <p>
        {item.model} {item.serial} ·{" "}
        {item.planned ? "Planiran sistem" : "Dodat na terenu"}
      </p>
      {item.enteredAt && (
        <p className="text-sm">
          Sačuvano na serveru ·{" "}
          {new Date(item.enteredAt).toLocaleString("sr-Latn-RS", {
            timeZone: visit.timeZone,
          })}{" "}
          · Autor: {item.enteredByLabel ?? "Raniji član tima"}
        </p>
      )}
      <SelectField label="Ishod" name="outcome" defaultValue={item.outcome}>
        {Object.entries(outcomeLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <Note label="Obavljeni radovi" name="work" value={item.work} />
      <Note label="Nalaz za klijenta" name="finding" value={item.finding} />
      <Note
        label="Razlog bez pristupa"
        name="noAccessReason"
        value={item.noAccessReason}
      />
      <details>
        <summary>Merenja i materijal</summary>
        <p>
          Decimalni zarez je dozvoljen. Nula je izmerena vrednost; prazan unos
          nije nula.
        </p>
        <Field
          label="Režim rada"
          name="mode"
          value={templateReadings.find(Boolean)?.mode ?? "Hlađenje"}
        />
        {(["temperature", "current"] as const).map((kind, index) => (
          <div key={kind} className="my-4 grid gap-3 sm:grid-cols-2">
            <SelectField
              label={
                index === 0 ? "Temperatura izduva — status" : "Struja — status"
              }
              name={kind + "Status"}
              defaultValue={templateReadings[index]?.status ?? "not_measured"}
            >
              {Object.entries(readingLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Field
              label={index === 0 ? "Temperatura izduva (°C)" : "Struja (A)"}
              name={kind + "Value"}
              inputMode="decimal"
              value={templateReadings[index]?.value?.toString() ?? ""}
            />
          </div>
        ))}
        {!!additionalReadings.length && (
          <p>
            Dodatna sačuvana merenja:{" "}
            {additionalReadings.map((reading) => reading.kind).join(", ")}. Ovim
            unosom ostaju sačuvana.
          </p>
        )}
        {partRows.map((index) => (
          <fieldset key={index} className="my-4 rounded border p-3">
            <legend>Materijal {index + 1}</legend>
            <Field
              label="Materijal / deo"
              name={`partName${index}`}
              value={item.parts[index]?.name}
            />
            <Field
              label="Količina"
              name={`quantity${index}`}
              inputMode="decimal"
              value={item.parts[index]?.quantity.toString() ?? "1"}
            />
            <Field
              label="Jedinica materijala"
              name={`partUnit${index}`}
              value={item.parts[index]?.unit ?? "kom"}
            />
            <button
              type="button"
              className="button secondary mt-3"
              onClick={() =>
                setPartRows((rows) => rows.filter((row) => row !== index))
              }
            >
              Ukloni materijal {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={partRows.length >= 20}
          onClick={() => {
            const index = nextPart.current++;
            setPartRows((rows) => [...rows, index]);
          }}
        >
          Dodaj materijal
        </button>
      </details>
      <details open={!!item.followUp}>
        <summary>Sledeća radnja</summary>
        <SelectField
          label="Vrsta radnje"
          name="followKind"
          defaultValue={item.followUp?.kind ?? ""}
        >
          <option value="">Bez radnje</option>
          {Object.entries(actionLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Odgovorni član tima"
          name="ownerId"
          defaultValue={item.followUp?.ownerId ?? ""}
        >
          <option value="">Izaberite odgovornu osobu</option>
          {visit.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <Field
          label="Rok"
          name="dueDate"
          type="date"
          value={item.followUp?.dueDate ?? ""}
        />
        <Note
          label="Šta se očekuje od klijenta"
          name="customerAction"
          value={item.followUp?.customerAction}
        />
      </details>
      <Note
        label="Interna beleška (ne ulazi u izveštaj)"
        name="internalNote"
        value={item.internalNote}
      />
      <Status {...state} />
      <button type="submit" className="button primary mt-4" disabled={pending}>
        {pending ? "Čuvanje…" : `Sačuvaj ${item.code}`}
      </button>
    </form>
  );
}
export function TransitionForm({
  visit,
  kind,
  operationId,
  children,
}: {
  visit: VisitBundle;
  kind: "submit" | "return" | "add";
  operationId: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(
    async (
      previous: { message?: string; success?: boolean },
      form: FormData,
    ) => {
      form.set(
        "payload",
        JSON.stringify(
          kind === "return"
            ? { reason: form.get("reason") }
            : kind === "add"
              ? { systemId: form.get("systemId") }
              : {},
        ),
      );
      return visitCommand(previous, form);
    },
    {},
  );
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="card my-5"
    >
      <input type="hidden" name="visitId" value={visit.id} />
      <input type="hidden" name="version" value={visit.version} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "return" && <Note label="Razlog dopune" name="reason" />}
      {kind === "add" && (
        <SelectField label="Postojeći sistem na lokaciji" name="systemId">
          {visit.availableSystems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.room}
            </option>
          ))}
        </SelectField>
      )}
      {children}
      <Status {...state} />
      <button type="submit" disabled={pending} className="button primary mt-4">
        {pending
          ? "Čuvanje…"
          : kind === "submit"
            ? "Predaj kancelariji"
            : kind === "return"
              ? "Vrati na dopunu"
              : "Dodaj sistem"}
      </button>
    </form>
  );
}
