import { z } from "zod";
import { itemSchema } from "@/features/visits/model";
import type { OfflineBundle } from "./model";
const envelope = {
  operationId: z.string().uuid(),
  reconcileFrom: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
};
export const syncOperationSchema = z.discriminatedUnion("type", [
  z
    .object({ ...envelope, type: z.literal("save"), payload: itemSchema })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("submit"),
      payload: z.object({}).strict(),
    })
    .strict(),
]);
export const syncRequestSchema = z
  .object({
    userId: z.string().uuid(),
    organizationId: z.string().uuid(),
    epoch: z.string().uuid(),
    operations: z
      .array(
        z
          .object({
            ...envelope,
            type: z.enum(["save", "submit"]),
            payload: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncAck = {
  operationId: string;
  visitId: string;
  type: "save" | "submit";
  baseVersion: number;
  confirmedAt: string;
  visit: Pick<
    OfflineBundle["visit"],
    | "version"
    | "status"
    | "startedAt"
    | "submittedAt"
    | "submittedBy"
    | "correctionReason"
  >;
  item: OfflineBundle["visit"]["items"][number] | null;
};
export type SyncResult = {
  operationId: string;
  status: number;
  error?: string;
  acknowledgement?: SyncAck;
};
export type Submission = {
  userId: string;
  organizationId: string;
  visitId: string;
  operationId: string;
  baseVersion: number;
  prerequisites: string[];
  reconcileFrom?: string;
  queuedAt: string;
  attemptedAt: string | null;
  error?: string;
  errorStatus?: number;
};
export const syncMessages: Record<string, string> = {
  replay_required:
    "Prethodna operacija je već potvrđena. Proverite trenutno stanje pre nastavka.",
  stale_version:
    "Podaci su promenjeni na serveru. Nacrt je zadržan; potrebno je usaglašavanje.",
  operation_conflict:
    "Ova operacija već postoji sa drugim podacima. Nacrt je zadržan.",
  visit_denied:
    "Pristup poseti više nije dozvoljen. Lokalni podaci nisu poslati.",
  pending_items: "Unesite ishod za svaki sistem pre predaje.",
  missing_follow_up: "Proverite nalaze, odgovorne članove tima i rokove.",
  pending_attachments: "Potvrdite ili uklonite fotografije koje čekaju slanje.",
  visit_locked: "Poseta je zaključana. Lokalni nacrt je zadržan.",
  invalid_input: "Proverite unos pre ponovnog slanja.",
  dependency_failed: "Slanje čeka prethodnu neuspešnu operaciju.",
};
export function submissionIssue(
  bundle: OfflineBundle,
  payloads: Map<string, z.infer<typeof itemSchema>>,
) {
  for (const item of bundle.visit.items) {
    const value = payloads.get(item.id) ?? item;
    if (value.outcome === "pending") return syncMessages.pending_items;
    if (
      (value.outcome === "repair_needed" && !value.finding.trim()) ||
      (["repair_needed", "no_access"].includes(value.outcome) &&
        !value.followUp) ||
      (value.followUp &&
        (!value.followUp.ownerId ||
          !value.followUp.dueDate ||
          (!item.followUp?.managedAt &&
            !bundle.visit.staff.some((s) => s.id === value.followUp!.ownerId))))
    )
      return syncMessages.missing_follow_up;
  }
  return null;
}
