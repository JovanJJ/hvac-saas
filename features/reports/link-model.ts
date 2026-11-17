import { z } from "zod";
export const reportTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const createLinkSchema = z.object({
  revisionId: z.string().uuid(),
  operationId: z.string().uuid(),
  token: reportTokenSchema,
  days: z.coerce.number().int().min(1).max(90),
});
export type ReportLink = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  expired: boolean;
};
