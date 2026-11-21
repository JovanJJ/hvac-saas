import { z } from "zod";
import type { RegisterRow } from "@/features/operations/types";
export type RegisterKind = "customer" | "site" | "system";
export const fields = {
  customer: [
    ["name", "Naziv klijenta"],
    ["contact", "Kontakt"],
  ],
  site: [
    ["code", "Oznaka lokacije"],
    ["name", "Naziv lokacije"],
    ["address", "Adresa"],
    ["timeZone", "Vremenska zona"],
    ["contact", "Kontakt lokacije"],
    ["accessNote", "Interne napomene za pristup"],
  ],
  system: [
    ["code", "Oznaka sistema"],
    ["room", "Prostorija"],
    ["systemType", "Vrsta sistema"],
    ["manufacturer", "Proizvođač"],
    ["model", "Model"],
    ["serial", "Serijski broj"],
  ],
  unit: [
    ["manufacturer", "Proizvođač"],
    ["model", "Model"],
    ["serial", "Serijski broj"],
  ],
} as const;
const short = z
  .string({ error: "Unesite tekst." })
  .trim()
  .max(120, "Unesite najviše 120 znakova.");
const text = z
  .string({ error: "Unesite tekst." })
  .max(2000, "Unesite najviše 2000 znakova.");
export const schemas = {
  customer: z.object({ name: short.min(1, "Obavezno polje."), contact: text }),
  site: z.object({
    code: short.min(1, "Obavezno polje."),
    name: short.min(1, "Obavezno polje."),
    address: short.min(1, "Obavezno polje."),
    timeZone: short.min(1, "Obavezno polje.").refine((value) => {
      try {
        new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Izaberite važeću vremensku zonu."),
    contact: text,
    accessNote: text,
  }),
  system: z.object({
    code: short.min(1, "Obavezno polje."),
    room: short.min(1, "Obavezno polje."),
    systemType: short,
    manufacturer: short,
    model: short,
    serial: short,
  }),
  unit: z.object({
    role: z.enum(["indoor", "outdoor"], {
      error: "Izaberite vrstu komponente.",
    }),
    manufacturer: short,
    model: short,
    serial: short,
  }),
};
export type Unit = RegisterRow & {
  system_id: string;
  role: "indoor" | "outdoor";
  version: number;
  created_at: string;
  replaces_id: string | null;
};
export type HistoryEntry = {
  visitId: string;
  itemId: string;
  systemId: string;
  date: string;
  timeZone: string;
  code: string;
  outcome: "serviced" | "repair_needed" | "no_access" | "pending";
  work: string;
  finding: string;
  noAccessReason: string;
  enteredBy: string | null;
  enteredByLabel: string | null;
  enteredAt: string | null;
  correctedAt: string | null;
  readings: {
    kind: string;
    status: string;
    value: number | null;
    unit: string;
  }[];
  parts: { name: string; quantity: number; unit: string }[];
  followUp: {
    kind: "quote" | "repair" | "revisit";
    state: "open" | "completed";
    dueDate: string;
    customerAction: string;
  } | null;
};
export type RegisterDetail = {
  record: RegisterRow & { version: number };
  parent: { id: string; name: string; archived: boolean } | null;
  children: RegisterRow[];
  units: Unit[];
  history: HistoryEntry[];
};
export function formValues(record: RegisterRow) {
  return {
    ...record,
    timeZone: record.time_zone ?? "",
    accessNote: record.access_note ?? "",
    systemType: record.system_type ?? "",
  };
}
