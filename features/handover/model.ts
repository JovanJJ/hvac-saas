import { z } from "zod";
export const receiptLabels = { missing: "Bez potvrde prijema", received: "Prijem potvrđen", all: "Sve potvrde" };
export const billingLabels = { pending: "Za proveru", ready: "Spremno za proveru naplate", recheck: "Potrebna ponovna provera", all: "Sva stanja" };
const schema = z.object({
  queue: z.enum(["receipts", "billing"]), state: z.string(),
  revision: z.enum(["all", "latest"]),
  site: z.union([z.literal(""), z.uuid()]), customer: z.union([z.literal(""), z.uuid()]),
  from: z.union([z.literal(""), z.iso.date()]), until: z.union([z.literal(""), z.iso.date()]),
  page: z.coerce.number().int().min(1).max(10000),
}).refine(f => f.queue === "receipts" ? Object.hasOwn(receiptLabels, f.state) : Object.hasOwn(billingLabels, f.state))
  .refine(f => !f.from || !f.until || f.from <= f.until);
export type Filters = z.infer<typeof schema>;
export type SearchParams = Record<string, string | string[] | undefined>;
export function readFilters(query: SearchParams) {
  const first = (key: string) => Array.isArray(query[key]) ? query[key][0] : query[key];
  const queue = first("queue") || "receipts";
  const defaults = { queue, state: queue === "billing" ? "pending" : "missing", revision: "all", site: "", customer: "", from: "", until: "", page: 1 };
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, first(key) || value])));
  return { filters: parsed.success ? parsed.data : { ...defaults, queue: "receipts", state: "missing" } as Filters, invalid: !parsed.success };
}
export function handoverLink(filters: Filters, changes: Partial<Filters> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) if (value !== "") query.set(key, String(value));
  return `/office/handover?${query}`;
}
export const billingCommandSchema = z.object({
  visitId: z.uuid(), operationId: z.uuid(), version: z.coerce.number().int().min(0),
  visitVersion: z.coerce.number().int().positive(), ready: z.enum(["true", "false"]),
  note: z.string().trim().min(1).max(2000),
});
export type BillingValue = {
  version: number; ready: boolean; stale: boolean; note: string;
  actor: string | null; updatedAt: string | null; sourceVersion: number | null; revisionId: string | null;
};
export type HandoverRow = {
  id: string; visitId: string; site: string; customer: string; at: string; timeZone: string;
  visitStatus: "submitted" | "issued" | "scheduled" | "in_progress" | "cancelled";
  revisionId?: string; number?: string; revision?: number; latest?: boolean;
  receiptCount?: number; activeLinks?: number; renderState?: "queued" | "rendering" | "ready" | "failed";
  billing?: BillingValue;
};
export type QueueData = { rows: HandoverRow[]; total: number; page: number; sites: { id: string; name: string }[]; customers: { id: string; name: string }[] };
export type BillingDetail = {
  visitId: string; visitVersion: number; status: HandoverRow["visitStatus"];
  site: string; customer: string; start: string; timeZone: string; revisionId: string | null;
  billing: BillingValue;
  history: { operationId: string; before: BillingValue; after: BillingValue; at: string }[];
};
