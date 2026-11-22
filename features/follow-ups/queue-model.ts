import { z } from "zod";

export const queueStates = {
  pending: "Nezavršeno",
  all: "Sva stanja",
  open: "Otvoreno",
  completed: "Završeno",
  quote: "Priprema ponude",
  repair: "Popravka",
  revisit: "Ponovni dolazak",
  proposed: "Predlog termina",
  paused: "Pauziran plan",
  scheduled: "Zakazano",
  in_progress: "U toku",
  submitted: "Predato kancelariji",
  issued: "Izdat izveštaj",
  cancelled: "Otkazano",
};
export const dueLabels = {
  all: "Svi rokovi", overdue: "U kašnjenju", today: "Danas",
  upcoming: "Narednih 30 dana", missing: "Bez roka",
};
export const bookingLabels = {
  all: "Svi termini", proposed: "Potrebno zakazivanje",
  booked: "Zakazana poseta", cancelled: "Otkazana povratna poseta",
};
export const dependencyLabels = {
  all: "Sve radnje", required: "Potrebno od klijenta", none: "Bez zahteva za klijenta",
};
const schema = z.object({
  queue: z.enum(["actions", "maintenance"]),
  state: z.enum(Object.keys(queueStates) as [keyof typeof queueStates, ...(keyof typeof queueStates)[]]),
  due: z.enum(["all", "overdue", "today", "upcoming", "missing"]),
  booking: z.enum(["all", "proposed", "booked", "cancelled"]),
  dependency: z.enum(["all", "required", "none"]),
  site: z.union([z.literal(""), z.uuid()]),
  owner: z.union([z.literal(""), z.uuid()]),
  page: z.coerce.number().int().min(1).max(10000),
}).refine(value => value.queue === "actions"
  ? ["pending", "all", "open", "completed", "quote", "repair", "revisit"].includes(value.state)
  : !["open", "completed", "quote", "repair", "revisit"].includes(value.state));
const defaults = {
  queue: "actions", state: "pending", due: "all", booking: "all",
  dependency: "all", site: "", owner: "", page: 1,
} as const;
export type QueueFilters = z.infer<typeof schema>;

export function readQueueFilters(query: Record<string, string | string[] | undefined>) {
  const input = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [
    key, (Array.isArray(query[key]) ? query[key][0] : query[key]) || value,
  ]));
  const parsed = schema.safeParse(input);
  return {
    filters: parsed.success ? parsed.data : { ...defaults },
    invalid: !parsed.success,
  };
}
export function queueLink(filters: QueueFilters, changes: Partial<QueueFilters> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (value !== "") query.set(key, String(value));
  }
  return `/office/actions?${query}`;
}

export type QueueRow = {
  id: string;
  kind: "quote" | "repair" | "revisit" | "maintenance";
  state: keyof typeof queueStates;
  siteId: string;
  site: string;
  customer: string;
  owner: string;
  ownerId?: string;
  dueDate: string | null;
  timeZone: string;
  overdue: boolean;
  code?: string;
  room?: string;
  finding?: string;
  work?: string;
  noAccessReason?: string;
  customerAction?: string;
  visitId?: string;
  itemId?: string;
  systemId?: string;
  returnVisitId?: string;
  returnStart?: string;
  returnState?: string;
  bookingState: "proposed" | "booked" | "none";
  planId?: string;
  planName?: string;
  planEnabled?: boolean;
  intendedDate?: string;
  start?: string;
};
export type WorkQueue = {
  rows: QueueRow[];
  total: number;
  page: number;
  sites: { id: string; name: string }[];
};
