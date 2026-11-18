"use client";
import Link from "next/link";
import { useId } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import {
  outcomeLabels,
  actionLabels,
  readingLabels,
} from "@/features/visits/model";
import type { AmendmentItem, AmendmentBundle } from "./amendment-model";
export type DraftItem = Omit<AmendmentItem, "readings" | "parts"> & {
  readings: (Omit<AmendmentItem["readings"][number], "value"> & {
    value: number | string | null;
  })[];
  parts: (Omit<AmendmentItem["parts"][number], "quantity"> & {
    quantity: number | string;
  })[];
};
function Text({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const id = useId();
  return multiline ? (
    <div className="my-4">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={2000}
        rows={3}
      />
    </div>
  ) : (
    <FormField
      id={id}
      label={label}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={2000}
    />
  );
}
export function AmendmentItemEditor({
  item,
  label,
  staff,
  onChange,
  managedAction,
}: {
  managedAction?: NonNullable<AmendmentBundle["actions"]>[string];
  item: DraftItem;
  label: string;
  staff: AmendmentBundle["staff"];
  onChange: (value: DraftItem) => void;
}) {
  const patch = (value: Partial<DraftItem>) => onChange({ ...item, ...value });
  return (
    <fieldset className="card my-4" aria-label={`Ispravka ${label}`}>
      <legend>{label}</legend>
      <SelectField
        label="Ishod"
        value={item.outcome}
        onChange={(e) =>
          patch({ outcome: e.target.value as DraftItem["outcome"] })
        }
      >
        {Object.entries(outcomeLabels)
          .filter(([key]) => key !== "pending")
          .map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
      </SelectField>
      {(["work", "finding", "noAccessReason"] as const).map((key, index) => (
        <Text
          key={key}
          multiline
          label={
            ["Obavljeni radovi", "Nalaz za klijenta", "Razlog bez pristupa"][
              index
            ]
          }
          value={item[key]}
          onChange={(value) => patch({ [key]: value })}
        />
      ))}
      <details>
        <summary>Merenja i materijal</summary>
        <p>Decimalni zarez je dozvoljen. Prazno merenje nije nula.</p>
        {item.readings.map((reading, index) => (
          <fieldset key={index} className="my-3 rounded border p-3">
            <legend>Merenje {index + 1}</legend>
            {(["kind", "mode", "unit"] as const).map((key, k) => (
              <Text
                key={key}
                label={["Vrsta merenja", "Režim rada", "Jedinica"][k]}
                value={reading[key]}
                onChange={(value) =>
                  patch({
                    readings: item.readings.map((r, i) =>
                      i === index ? { ...r, [key]: value } : r,
                    ),
                  })
                }
              />
            ))}
            <SelectField
              label="Status merenja"
              value={reading.status}
              onChange={(e) =>
                patch({
                  readings: item.readings.map((r, i) =>
                    i === index
                      ? {
                          ...r,
                          status: e.target.value as typeof reading.status,
                          value: e.target.value === "measured" ? r.value : null,
                        }
                      : r,
                  ),
                })
              }
            >
              {Object.entries(readingLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            {reading.status === "measured" && (
              <Text
                label="Izmerena vrednost"
                value={String(reading.value ?? "")}
                onChange={(value) =>
                  patch({
                    readings: item.readings.map((r, i) =>
                      i === index ? { ...r, value } : r,
                    ),
                  })
                }
              />
            )}
            <button
              type="button"
              className="button mt-3"
              onClick={() =>
                patch({ readings: item.readings.filter((_, i) => i !== index) })
              }
            >
              Ukloni merenje {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button my-3"
          disabled={item.readings.length >= 10}
          onClick={() =>
            patch({
              readings: [
                ...item.readings,
                {
                  kind: "Temperatura izduva",
                  mode: "Hlađenje",
                  status: "not_measured",
                  value: null,
                  unit: "°C",
                },
              ],
            })
          }
        >
          Dodaj merenje
        </button>
        {item.parts.map((part, index) => (
          <fieldset key={index} className="my-3 rounded border p-3">
            <legend>Materijal {index + 1}</legend>
            {(["name", "quantity", "unit"] as const).map((key, k) => (
              <Text
                key={key}
                label={
                  ["Materijal / deo", "Količina", "Jedinica materijala"][k]
                }
                value={String(part[key])}
                onChange={(value) =>
                  patch({
                    parts: item.parts.map((p, i) =>
                      i === index ? { ...p, [key]: value } : p,
                    ),
                  })
                }
              />
            ))}
            <button
              type="button"
              className="button mt-3"
              onClick={() =>
                patch({ parts: item.parts.filter((_, i) => i !== index) })
              }
            >
              Ukloni materijal {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button"
          disabled={item.parts.length >= 20}
          onClick={() =>
            patch({
              parts: [...item.parts, { name: "", quantity: 1, unit: "kom" }],
            })
          }
        >
          Dodaj materijal
        </button>
      </details>
      {managedAction?.managedAt && (
        <p>
          Radnjom upravlja kancelarija.{" "}
          <Link href={`/office/actions/${managedAction.id}`}>
            Otvori radnju
          </Link>
        </p>
      )}
      <fieldset disabled={!!managedAction?.managedAt}>
        <legend>Sledeća radnja</legend>
        <SelectField
          label="Vrsta radnje"
          value={item.followUp?.kind ?? ""}
          onChange={(e) =>
            patch({
              followUp: e.target.value
                ? {
                    kind: e.target.value as NonNullable<
                      DraftItem["followUp"]
                    >["kind"],
                    ownerId: item.followUp?.ownerId ?? "",
                    dueDate: item.followUp?.dueDate ?? "",
                    customerAction: item.followUp?.customerAction ?? "",
                  }
                : null,
            })
          }
        >
          <option value="">Bez radnje</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        {item.followUp && (
          <>
            <SelectField
              label="Odgovorni član tima"
              value={item.followUp.ownerId}
              onChange={(e) =>
                patch({
                  followUp: { ...item.followUp!, ownerId: e.target.value },
                })
              }
            >
              <option value="">Izaberite odgovornu osobu</option>
              {managedAction?.state === "completed" &&
                !staff.some((s) => s.id === item.followUp!.ownerId) && (
                  <option value={item.followUp.ownerId}>
                    {managedAction.ownerLabel || "Raniji član tima"}
                  </option>
                )}
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectField>
            <Text
              label="Rok"
              type="date"
              value={item.followUp.dueDate}
              onChange={(value) =>
                patch({ followUp: { ...item.followUp!, dueDate: value } })
              }
            />
            <Text
              label="Šta se očekuje od klijenta"
              multiline
              value={item.followUp.customerAction}
              onChange={(value) =>
                patch({
                  followUp: { ...item.followUp!, customerAction: value },
                })
              }
            />
          </>
        )}
      </fieldset>
    </fieldset>
  );
}
export function normalizeDraft(items: DraftItem[]) {
  const numeric = (value: number | string | null) => {
    if (typeof value === "number" || value === null) return value;
    const text = value.trim().replace(",", ".");
    return /^[-+]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
  };
  return items.map((item) => ({
    ...item,
    readings: item.readings.map((r) => ({
      ...r,
      value: r.status === "measured" ? numeric(r.value) : null,
    })),
    parts: item.parts.map((p) => ({ ...p, quantity: numeric(p.quantity) })),
  }));
}
