import { z } from "zod";
export const datasetIds = ["customers", "sites", "systems", "units", "visits", "visit_items"] as const;
export type Dataset = typeof datasetIds[number];
export const datasetLabels: Record<Dataset, string> = {
  customers: "Klijenti", sites: "Lokacije", systems: "Sistemi",
  units: "Komponente sistema", visits: "Posete", visit_items: "Sistemi po poseti i nalazi",
};
export const exportSchema = z.object({
  datasets: z.array(z.enum(datasetIds)).min(1).max(6).refine(values => new Set(values).size === values.length),
  site: z.union([z.literal(""), z.uuid()]),
});
export type ExportRow = Record<string, string | number | boolean | null>;
export type ExportSnapshot = {
  schemaVersion: number; exportedAt: string; organizationId: string;
  scope: "organization" | "site"; siteId: string | null; includesArchived: boolean;
  counts: Record<Dataset, number>; datasets: Partial<Record<Dataset, ExportRow[]>>;
};
export type ExportCatalog = ExportSnapshot & { sites: { id: string; code: string; name: string; archived: boolean }[] };
const common = [["organization_id", "ID organizacije"], ["customer_id", "ID klijenta"]] as const;
const site = [...common, ["site_id", "ID lokacije"]] as const;
const system = [...site, ["system_id", "ID sistema"]] as const;
export const columns: Record<Dataset, readonly (readonly [string, string])[]> = {
  customers: [...common, ["name", "Naziv klijenta"], ["contact", "Kontakt"], ["version", "Verzija"], ["archived_at", "Arhivirano"]],
  sites: [...site, ["code", "Oznaka lokacije"], ["name", "Naziv lokacije"], ["address", "Adresa"], ["time_zone", "Vremenska zona"], ["contact", "Kontakt lokacije"], ["access_note", "Interne napomene za pristup"], ["version", "Verzija"], ["archived_at", "Arhivirano"]],
  systems: [...system, ["code", "Oznaka sistema"], ["room", "Prostorija"], ["system_type", "Vrsta sistema"], ["manufacturer", "Proizvođač"], ["model", "Model"], ["serial", "Serijski broj"], ["version", "Verzija"], ["archived_at", "Arhivirano"]],
  units: [...system, ["unit_id", "ID komponente"], ["role", "Vrsta komponente"], ["manufacturer", "Proizvođač"], ["model", "Model"], ["serial", "Serijski broj"], ["replaces_id", "ID prethodne komponente"], ["version", "Verzija"], ["archived_at", "Arhivirano"]],
  visits: [...site, ["visit_id", "ID posete"], ["visit_type", "Vrsta posete"], ["status", "Stanje posete"], ["scheduled_at", "Zakazani početak"], ["ends_at", "Zakazani završetak"], ["time_zone", "Vremenska zona"], ["started_at", "Započeto"], ["submitted_at", "Predato"], ["version", "Verzija"], ["cancelled_at", "Otkazano"], ["cancellation_reason", "Razlog otkazivanja"], ["plan_id", "ID plana"], ["intended_date", "Izvorni datum plana"], ["latest_revision_id", "ID najnovije revizije"], ["billing_ready", "Označeno za proveru naplate"], ["billing_needs_recheck", "Potrebna ponovna provera naplate"], ["billing_reviewed_at", "Vreme provere naplate"]],
  visit_items: [...system, ["visit_id", "ID posete"], ["visit_item_id", "ID nalaza"], ["planned", "Planirani sistem"], ["outcome", "Ishod"], ["work", "Radovi"], ["finding", "Nalaz"], ["no_access_reason", "Razlog bez pristupa"], ["entered_by", "ID autora nalaza"], ["entered_at", "Vreme unosa"], ["corrected_by", "ID autora ispravke"], ["corrected_at", "Vreme ispravke"], ["follow_up_id", "ID sledeće radnje"], ["follow_up_kind", "Vrsta radnje"], ["follow_up_state", "Stanje radnje"], ["follow_up_owner_id", "ID odgovornog člana"], ["follow_up_due_date", "Rok radnje"], ["customer_action", "Potrebno od klijenta"], ["return_visit_id", "ID povratne posete"]],
};
