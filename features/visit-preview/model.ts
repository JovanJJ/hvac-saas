export type Outcome = "pending" | "serviced" | "repair_needed" | "no_access";
export const outcomeLabels: Record<Outcome, string> = {
  pending: "Čeka unos",
  serviced: "Servisirano",
  repair_needed: "Potrebna popravka",
  no_access: "Nema pristupa",
};
export type ReadingStatus = "not_measured" | "measured" | "not_applicable";
export type Item = {
  code: string;
  room: string;
  model: string;
  outcome: Outcome;
  work: string;
  finding: string;
  internalNote: string;
  readingStatus: ReadingStatus;
  reading: string;
  action: string;
  owner: string;
  deadline: string;
};
export const visit = {
  reference: "RN-2026-0142",
  site: "Poslovni centar Morava",
  siteCode: "JA-02",
  customer: "Morava primer d.o.o.",
  address: "Primer ulica 12, Jagodina",
  technician: "Marko Petrović",
  date: "16.11.2026.",
  window: "09:00–11:00",
  accessNote: "Za pristup arhivi obratiti se predstavniku lokacije.",
};
export function createItems(): Item[] {
  return ["Recepcija", "Kancelarija", "Sala za sastanke", "Arhiva"].map(
    (room, i) => ({
      code: `KL-0${i + 1}`,
      room,
      model: "Primer klima / split sistem",
      outcome: "pending",
      work: "",
      finding: "",
      internalNote: "",
      readingStatus: "not_measured",
      reading: "",
      action: "",
      owner: "",
      deadline: "",
    }),
  );
}
export function needsAction(item: Item) {
  return item.outcome === "repair_needed" || item.outcome === "no_access";
}
export function counts(items: Item[]) {
  return {
    planned: items.length,
    inspected: items.filter(
      (i) => i.outcome === "serviced" || i.outcome === "repair_needed",
    ).length,
    actions: items.filter(needsAction).length,
  };
}
export function validateItem(item: Item): string[] {
  const errors: string[] = [];
  if (item.outcome === "pending")
    errors.push("Izaberite ishod za ovaj sistem.");
  if (item.outcome === "serviced" && !item.work.trim())
    errors.push("Unesite obavljene radove.");
  if (needsAction(item)) {
    if (!item.finding.trim())
      errors.push(
        item.outcome === "no_access"
          ? "Unesite razlog nedostupnosti."
          : "Unesite nalaz.",
      );
    if (!item.action.trim()) errors.push("Unesite sledeći korak.");
    if (!item.owner) errors.push("Izaberite odgovornu osobu.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.deadline))
      errors.push("Unesite rok za narednu radnju.");
  }
  if (
    item.outcome !== "no_access" &&
    item.readingStatus === "measured" &&
    (!/^-?\d+(?:[.,]\d+)?$/.test(item.reading.trim()) ||
      !Number.isFinite(Number(item.reading.replace(",", "."))))
  ) {
    errors.push("Unesite ispravnu izmerenu vrednost, na primer 0 ili 12,5.");
  }
  return errors;
}
export function readingText(item: Item) {
  if (item.outcome === "no_access") return "Nije pregledano — nema pristupa.";
  if (item.readingStatus === "not_applicable") return "Nije primenljivo";
  if (item.readingStatus === "not_measured") return "Nije mereno";
  return `${Number(item.reading.replace(",", ".")).toLocaleString("sr-Latn-RS")} °C`;
}
// Explicit customer allowlist: internal notes and access instructions never enter the report.
export function toCustomerItem(item: Item) {
  return {
    code: item.code,
    room: item.room,
    model: item.model,
    outcome: item.outcome,
    work: item.outcome === "no_access" ? "" : item.work,
    finding: item.finding,
    reading: readingText(item),
    action: needsAction(item) ? item.action : "",
    owner: needsAction(item) ? item.owner : "",
    deadline: needsAction(item) ? item.deadline : "",
  };
}
export function formatDate(value: string) {
  return value ? value.split("-").reverse().join(".") + "." : "";
}
