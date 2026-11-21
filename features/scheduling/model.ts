import { z } from "zod";
import type { ScheduledVisit } from "@/features/operations/types";
export type ScheduleVisit = ScheduledVisit & {
  version: number;
  status: "scheduled" | "in_progress" | "submitted" | "issued" | "cancelled";
  siteId: string;
  members: string[];
  cancellationReason: string;
};
export type ScheduleDetail = Pick<
  ScheduleVisit,
  | "id"
  | "version"
  | "status"
  | "site"
  | "start"
  | "end"
  | "timeZone"
  | "members"
  | "cancellationReason"
> & {
  cancelledAt: string | null;
  history: {
    operationId: string;
    kind: ChangeKind;
    data: {
      start?: string;
      end?: string;
      members?: string[];
      reason?: string;
      timeZone?: string;
    };
    before: {
      scheduled_at: string;
      ends_at: string;
      members: string[];
      status: string;
      version: number;
    };
    actor: string;
    at: string;
  }[];
};
export type ChangeKind = "reschedule" | "reassign" | "cancel";
export type SearchParams = Record<string, string | string[] | undefined>;
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Unesite datum i vreme.");
export const rescheduleSchema = z
  .object({
    start: localTime,
    end: localTime,
    timeZone: z.string().min(1).max(120),
  })
  .refine((data) => data.end > data.start, {
    message: "Završetak mora biti posle početka.",
    path: ["end"],
  });
export const membersSchema = z.object({
  members: z
    .array(z.string().uuid())
    .min(1, "Izaberite najmanje jednog člana tima.")
    .max(50),
});
export const cancellationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Unesite razlog otkazivanja.")
    .max(2000, "Unesite najviše 2000 znakova."),
});
export const changeLabels = {
  reschedule: "Promena termina",
  reassign: "Promena dodele",
  cancel: "Otkazivanje posete",
};
export function localInput(instant: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function shiftDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function readFilters(query: SearchParams, today: string) {
  const schema = z.object({
    date: z.iso.date(),
    view: z.enum(["day", "week"]),
    site: z.union([z.literal(""), z.string().uuid()]),
    technician: z.union([z.literal(""), z.string().uuid()]),
    cancelled: z.boolean(),
  });
  const first = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const result = schema.safeParse({
    date: first("date") || today,
    view: first("view") || "day",
    site: first("site") || "",
    technician: first("technician") || "",
    cancelled: first("cancelled") === "on",
  });
  const filters = result.success
    ? result.data
    : {
        date: today,
        view: "day" as const,
        site: "",
        technician: "",
        cancelled: false,
      };
  const day = new Date(filters.date + "T12:00:00Z").getUTCDay();
  const from =
    filters.view === "week"
      ? shiftDate(filters.date, -((day + 6) % 7))
      : filters.date;
  return {
    ...filters,
    from,
    until: filters.view === "week" ? shiftDate(from, 6) : from,
    invalid: !result.success,
  };
}
export function scheduleLink(
  filters: ReturnType<typeof readFilters>,
  date: string,
) {
  const query = new URLSearchParams({ date, view: filters.view });
  if (filters.site) query.set("site", filters.site);
  if (filters.technician) query.set("technician", filters.technician);
  if (filters.cancelled) query.set("cancelled", "on");
  return `/schedule?${query}`;
}
