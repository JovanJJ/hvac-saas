import { z } from "zod";
export const planSchema = z.object({
  siteId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Unesite naziv plana.")
    .max(120, "Unesite najviše 120 znakova."),
  anchorDate: z.iso
    .date({ error: "Unesite važeći datum." })
    .refine(
      (value) => value >= "2000-01-01" && value <= "2100-12-31",
      "Datum mora biti između 2000. i 2100. godine.",
    ),
  anchorTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Unesite vreme od 00:00 do 23:59."),
  timeZone: z.string().min(1).max(120),
  intervalMonths: z.coerce
    .number({ error: "Unesite broj meseci." })
    .int("Unesite ceo broj meseci.")
    .min(1, "Interval mora biti najmanje jedan mesec.")
    .max(120, "Interval može biti najviše 120 meseci."),
  durationMinutes: z.coerce
    .number({ error: "Unesite trajanje." })
    .int("Unesite ceo broj minuta.")
    .min(15, "Trajanje mora biti najmanje 15 minuta.")
    .max(1440, "Trajanje može biti najviše 1440 minuta."),
  systems: z
    .array(z.uuid())
    .min(1, "Izaberite najmanje jedan sistem.")
    .max(500, "Izaberite najviše 500 sistema."),
  members: z
    .array(z.uuid())
    .min(1, "Izaberite najmanje jednog člana tima.")
    .max(50, "Izaberite najviše 50 članova tima."),
});
export type PlanInput = z.infer<typeof planSchema>;
export type Occurrence = {
  intendedDate: string;
  intendedLocal: string;
  resolvedLocal: string;
  startsAt: string;
  endsAt: string;
  resolution: "exact" | "gap_forward" | "overlap_earlier";
  shiftMinutes: number;
  timeZone: string;
  monthEndClamped: boolean;
};
export type PlanDetail = PlanInput & {
  id: string;
  version: number;
  enabled: boolean;
  occurrences: Occurrence[];
  history: {
    kind: string;
    enabled: boolean;
    actor: string;
    at: string;
    version: number;
  }[];
};
export type EditorOptions = {
  sites: { id: string; name: string; code: string; timeZone: string }[];
  site: {
    id: string;
    name: string;
    code: string;
    timeZone: string;
    active: boolean;
  } | null;
  systems: { id: string; code: string; room: string; active: boolean }[];
  staff: { id: string; label: string; active: boolean }[];
  defaultMember: string;
  today: string;
};
export type PlanList = {
  plans: {
    id: string;
    name: string;
    enabled: boolean;
    anchorDate: string;
    anchorTime: string;
    intervalMonths: number;
    site: string;
    siteCode: string;
    timeZone: string;
    systemCount: number;
  }[];
  total: number;
};
export function recurrenceNote(row: Occurrence) {
  const notes: string[] = [];
  if (row.monthEndClamped)
    notes.push("Skraćeno na kraj meseca; izvorni dan ostaje sidro.");
  if (row.resolution === "gap_forward")
    notes.push(
      `Nepostojeće vreme pomereno na prvo važeće vreme: ${row.resolvedLocal.replace("T", " ")}.`,
    );
  if (row.resolution === "overlap_earlier")
    notes.push("Dvostruko lokalno vreme: izabran je raniji termin.");
  return notes.join(" ");
}
