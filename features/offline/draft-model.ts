import { itemSchema, type ItemInput } from "@/features/visits/model";
import type { OfflineBundle, OfflineIdentity } from "./model";
export type DraftValues = Omit<ItemInput, "itemId" | "readings" | "parts"> & {
  readings: (Omit<ItemInput["readings"][number], "value"> & {
    value: string | null;
  })[];
  parts: (Omit<ItemInput["parts"][number], "quantity"> & {
    quantity: string;
  })[];
};
export type FieldDraft = {
  schemaVersion: 1;
  userId: string;
  organizationId: string;
  visitId: string;
  itemId: string;
  actorId: string;
  actorLabel: string;
  operationId: string;
  baseVisitVersion: number;
  baseItemVersion: number;
  baseEnteredBy: string | null;
  baseEnteredAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: "local" | "queued";
  queuedAt: string | null;
  attemptedAt: string | null;
  payload: ItemInput | null;
  error?: string;
  errorStatus?: number;
  values: DraftValues;
};
export function toDraftValues(
  item: OfflineBundle["visit"]["items"][number],
): DraftValues {
  return {
    outcome: item.outcome,
    work: item.work,
    finding: item.finding,
    noAccessReason: item.noAccessReason,
    internalNote: item.internalNote,
    readings: item.readings.map((r) => ({
      ...r,
      unit: r.unit ?? "",
      value: r.value === null ? null : String(r.value),
    })),
    parts: item.parts.map((p) => ({ ...p, quantity: String(p.quantity) })),
    followUp: item.followUp
      ? {
          kind: item.followUp.kind,
          ownerId: item.followUp.ownerId ?? "",
          dueDate: item.followUp.dueDate ?? "",
          customerAction: item.followUp.customerAction,
        }
      : null,
  };
}
export function draftPayload(values: DraftValues, itemId: string): ItemInput {
  const number = (value: string | null) => {
    const input = value?.trim().replace(",", ".") ?? "";
    return /^[-+]?\d+(\.\d+)?$/.test(input) && Number.isFinite(Number(input))
      ? Number(input)
      : null;
  };
  const parsed = itemSchema.safeParse({
    ...values,
    itemId,
    readings: values.readings.map((r) => ({
      ...r,
      value: r.status === "measured" ? number(r.value) : null,
    })),
    parts: values.parts.map((p) => ({ ...p, quantity: number(p.quantity) })),
  });
  if (!parsed.success)
    throw new Error(
      "Proverite merenja, količine i podatke o pristupu. Prazno merenje nije nula.",
    );
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > 29000)
    throw new Error("Proverite dužinu unosa. Nacrt je prevelik za slanje.");
  return parsed.data;
}
export function makeDraft(
  identity: OfflineIdentity,
  bundle: OfflineBundle,
  itemId: string,
  values: DraftValues,
  previous?: FieldDraft,
): FieldDraft {
  const item = bundle.visit.items.find((i) => i.id === itemId);
  if (!item) throw new Error("item_unavailable");
  if (JSON.stringify(values).length > 100000)
    throw new Error("draft_too_large");
  if (
    item.followUp?.managedAt &&
    JSON.stringify(values.followUp) !==
      JSON.stringify(toDraftValues(item).followUp)
  )
    throw new Error("follow_up_managed");
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    userId: identity.userId,
    organizationId: identity.organizationId,
    visitId: bundle.visit.id,
    itemId,
    actorId: identity.userId,
    actorLabel: identity.userLabel,
    operationId: previous?.operationId ?? crypto.randomUUID(),
    baseVisitVersion: previous?.baseVisitVersion ?? bundle.visit.version,
    baseItemVersion: previous?.baseItemVersion ?? item.version,
    baseEnteredBy: previous?.baseEnteredBy ?? item.enteredBy,
    baseEnteredAt: previous?.baseEnteredAt ?? item.enteredAt,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: (previous?.revision ?? 0) + 1,
    status: "local",
    queuedAt: null,
    attemptedAt: null,
    payload: null,
    values: structuredClone(values),
  };
}
