import { z } from "zod";

export const outcomeLabels = {
  pending: "Čeka unos",
  serviced: "Servisirano",
  repair_needed: "Potrebna popravka",
  no_access: "Bez pristupa",
};
export const actionLabels = {
  quote: "Ponuda",
  repair: "Popravka",
  revisit: "Ponovni dolazak",
};
export const readingLabels = {
  measured: "Izmereno",
  not_measured: "Nije mereno",
  not_applicable: "Nije primenljivo",
};
const text = z.string().max(2000);
export const readingSchema = z
  .object({
    kind: text.min(1),
    mode: text.min(1),
    status: z.enum(["measured", "not_measured", "not_applicable"]),
    value: z.number().finite().nullable(),
    unit: text.min(1),
  })
  .refine((r) =>
    r.status === "measured" ? r.value !== null : r.value === null,
  );
export const itemSchema = z
  .object({
    itemId: z.string().uuid(),
    outcome: z.enum(["pending", "serviced", "repair_needed", "no_access"]),
    work: text,
    finding: text,
    noAccessReason: text,
    internalNote: text,
    readings: z.array(readingSchema).max(10),
    parts: z
      .array(
        z.object({
          name: text.min(1),
          quantity: z.number().positive(),
          unit: text.min(1),
        }),
      )
      .max(20),
    followUp: z
      .object({
        kind: z.enum(["quote", "repair", "revisit"]),
        ownerId: z.union([z.string().uuid(), z.literal("")]),
        dueDate: z.union([z.iso.date(), z.literal("")]),
        customerAction: text,
      })
      .nullable(),
  })
  .refine(
    (i) =>
      i.outcome !== "no_access" ||
      (i.noAccessReason.trim() &&
        !i.work.trim() &&
        !i.parts.length &&
        i.readings.every((r) => r.status !== "measured")),
    {
      message:
        "Bez pristupa: unesite razlog; radovi, materijal i merenja nisu dozvoljeni.",
    },
  );
export type ItemInput = z.infer<typeof itemSchema>;
export type VisitItem = Omit<ItemInput, "itemId" | "followUp"> & {
  systemId?: string;
  id: string;
  version: number;
  planned: boolean;
  code: string;
  room: string;
  model: string;
  serial: string;
  enteredBy: string | null;
  enteredByLabel: string | null;
  enteredAt: string | null;
  followUp:
    | (NonNullable<ItemInput["followUp"]> & {
        id?: string;
        version?: number;
        managedAt?: string | null;
        state?: "open" | "completed";
        ownerLabel?: string | null;
        completedAt?: string | null;
      })
    | null;
  correctedAt?: string | null;
  correctedByLabel?: string | null;
};
export type VisitBundle = {
  technicians: string[];
  id: string;
  version: number;
  status: "scheduled" | "in_progress" | "submitted" | "issued";
  site: string;
  address: string;
  accessNote: string;
  customer: string;
  contact: string;
  timeZone: string;
  start: string;
  visitType: string;
  startedAt: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  correctionReason: string;
  staff: { id: string; label: string }[];
  availableSystems: { id: string; code: string; room: string }[];
  items: VisitItem[];
};
export function totals(items: VisitItem[]) {
  return {
    planned: items.filter((i) => i.planned).length,
    inspected: items.filter(
      (i) => i.outcome === "serviced" || i.outcome === "repair_needed",
    ).length,
    actions: items.filter((i) => i.followUp && i.followUp.state !== "completed")
      .length,
  };
}
export function submissionIssues(items: VisitItem[]) {
  return items.flatMap((i) => {
    const issues: string[] = [];
    if (i.outcome === "pending") issues.push(`${i.code}: unesite ishod.`);
    if (
      (i.outcome === "repair_needed" || i.outcome === "no_access") &&
      !i.followUp
    )
      issues.push(`${i.code}: dodajte sledeću radnju.`);
    if (i.followUp && (!i.followUp.ownerId || !i.followUp.dueDate))
      issues.push(`${i.code}: izaberite odgovornog člana tima i rok.`);
    if (i.outcome === "repair_needed" && !i.finding.trim())
      issues.push(`${i.code}: opišite nalaz.`);
    return issues;
  });
}
