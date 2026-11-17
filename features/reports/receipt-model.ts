import { z } from "zod";
export const receiptSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  acknowledged: z.literal(true),
});
export type ReportReceipt = {
  id: string;
  linkId: string;
  revisionId: string;
  name: string;
  role: string;
  confirmedAt: string;
  method: "guest_link";
  statementVersion: "receipt-v1";
};
