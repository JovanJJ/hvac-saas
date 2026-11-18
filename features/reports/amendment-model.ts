import { z } from "zod";
import { itemSchema } from "@/features/visits/model";
export const amendmentItemSchema = z
  .object({
    itemId: itemSchema.shape.itemId,
    version: z.number().int().positive(),
    outcome: z.enum(["serviced", "repair_needed", "no_access"]),
    work: itemSchema.shape.work,
    finding: itemSchema.shape.finding,
    noAccessReason: itemSchema.shape.noAccessReason,
    readings: itemSchema.shape.readings,
    parts: itemSchema.shape.parts,
    followUp: itemSchema.shape.followUp,
  })
  .superRefine((item, context) => {
    if (
      item.outcome === "no_access" &&
      (!item.noAccessReason.trim() ||
        item.work.trim() ||
        item.parts.length ||
        item.readings.some((r) => r.status === "measured"))
    )
      context.addIssue({
        code: "custom",
        message:
          "Bez pristupa: unesite razlog i uklonite radove, materijal i merenja.",
      });
    if (item.outcome === "repair_needed" && !item.finding.trim())
      context.addIssue({
        code: "custom",
        message: "Opišite nalaz za popravku.",
      });
    if (
      (["repair_needed", "no_access"].includes(item.outcome) &&
        !item.followUp) ||
      (item.followUp && (!item.followUp.ownerId || !item.followUp.dueDate))
    )
      context.addIssue({
        code: "custom",
        message: "Izaberite odgovornog člana tima i rok za sledeću radnju.",
      });
  });
export const amendmentSchema = z.object({
  baseRevisionId: z.string().uuid(),
  operationId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
  items: z.array(amendmentItemSchema).min(1).max(500),
});
export type AmendmentItem = z.infer<typeof amendmentItemSchema>;
export type AmendmentBundle = {
  visitVersion: number;
  actions?: Record<
    string,
    {
      id: string;
      state: "open" | "completed";
      managedAt: string | null;
      ownerLabel: string | null;
      completedAt: string | null;
    }
  >;
  items: AmendmentItem[];
  staff: { id: string; label: string }[];
};
