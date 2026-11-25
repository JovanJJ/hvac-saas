"use client";
import { useActionState, useState } from "react";
import { amendReport } from "./amendment-actions";
import {
  amendmentSchema,
  type AmendmentBundle,
  type AmendmentItem,
} from "./amendment-model";
import {
  AmendmentItemEditor,
  normalizeDraft,
  type DraftItem,
} from "./amendment-item-editor";
import { ReportDocument } from "./document";
import type { ReportRevision } from "./model";
export function AmendmentForm({
  revision,
  bundle,
  operationId,
}: {
  revision: ReportRevision;
  bundle: AmendmentBundle;
  operationId: string;
}) {
  const [items, setItems] = useState<DraftItem[]>(bundle.items),
    [reason, setReason] = useState(""),
    [review, setReview] = useState<AmendmentItem[] | null>(null),
    [message, setMessage] = useState("");
  const [stableOperation] = useState(operationId),
    [state, action, pending] = useActionState(amendReport, {});
  const command = {
    baseRevisionId: revision.id,
    operationId: stableOperation,
    version: bundle.visitVersion,
    reason,
    items: normalizeDraft(items),
  };
  function preview() {
    const result = amendmentSchema.safeParse(command);
    if (!result.success) {
      setMessage(
        "Unesite razlog i proverite sve ishode, merenja, materijal, odgovorne osobe i rokove.",
      );
      return;
    }
    if (
      result.data.items.some(
        (item) =>
          item.followUp &&
          bundle.actions?.[item.itemId]?.state !== "completed" &&
          !bundle.staff.some((member) => member.id === item.followUp!.ownerId),
      )
    ) {
      setMessage("Izaberite aktivnog odgovornog člana tima za svaku radnju.");
      return;
    }
    setMessage("");
    setReview(result.data.items);
  }
  const previewReport = review && {
    ...revision.data,
    templateVersion: "service-report-v2" as const,
    actionStateVersion: 1 as const,
    totals: {
      planned: revision.data.totals.planned,
      inspected: review.filter(
        (i) => i.outcome === "serviced" || i.outcome === "repair_needed",
      ).length,
      actions: review.filter(
        (i) => i.followUp && bundle.actions?.[i.itemId]?.state !== "completed",
      ).length,
    },
    revision: revision.revision + 1,
    issuedAt: null,
    issuer: null,
    amendment: { reason: reason.trim(), previousRevision: revision.revision },
    items: revision.data.items.map((item, index) => ({
      ...item,
      ...review[index],
      followUp: review[index].followUp
        ? {
            ...review[index].followUp!,
            state:
              bundle.actions?.[review[index].itemId]?.state ??
              ("open" as const),
            completedAt: bundle.actions?.[review[index].itemId]?.completedAt,
            owner:
              bundle.staff.find((s) => s.id === review[index].followUp!.ownerId)
                ?.label ??
              bundle.actions?.[review[index].itemId]?.ownerLabel ??
              "",
          }
        : null,
    })),
  };
  return (
    <details className="my-5" aria-label="Ispravka izveštaja">
      <summary className="button">Ispravi izveštaj</summary>
      <p className="my-4">
        Ispravka izdaje novu reviziju. Prethodni PDF, linkovi i potvrde prijema
        ostaju vezani za prethodnu reviziju. Identitet lokacije/opreme i
        odobrene fotografije ostaju iz izdatog izveštaja.
      </p>
      {!review ? (
        <>
          <label>
            Razlog ispravke (vidljiv klijentu)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </label>
          {items.map((item, index) => (
            <AmendmentItemEditor
              key={item.itemId}
              item={item}
              label={`${revision.data.items[index].code} · ${revision.data.items[index].room}`}
              staff={bundle.staff}
              managedAction={bundle.actions?.[item.itemId]}
              onChange={(value) =>
                setItems(items.map((i, k) => (k === index ? value : i)))
              }
            />
          ))}
          <button type="button" className="button primary" onClick={preview}>
            Pregledaj ispravku
          </button>
        </>
      ) : (
        <>
          <h2>Pregled nove revizije</h2>
          <ReportDocument report={previewReport!} draft scrollableSummary />
          <form action={action} onReset={(e) => e.preventDefault()}>
            <input
              type="hidden"
              name="payload"
              value={JSON.stringify({ ...command, items: review })}
            />
            <p>
              Proverite kompletan sadržaj pre izdavanja revizije{" "}
              {revision.revision + 1}.
            </p>
            <button className="button primary my-3" disabled={pending}>
              {pending
                ? "Izdavanje…"
                : `Izdaj reviziju ${revision.revision + 1}`}
            </button>
            <button
              type="button"
              className="button mx-3"
              disabled={pending}
              onClick={() => setReview(null)}
            >
              Nazad na izmenu
            </button>
          </form>
        </>
      )}
      {(message || state.message) && (
        <p role="alert" className="my-4">
          {message || state.message}
        </p>
      )}
    </details>
  );
}
