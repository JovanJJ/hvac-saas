export const importLimits = {
  bytes: 512 * 1024,
  rows: 500,
  columns: 32,
  cell: 2000,
};
export const importFields = {
  siteCode: "Oznaka lokacije",
  systemCode: "Oznaka sistema",
  room: "Prostorija",
  manufacturer: "Proizvođač",
  model: "Model",
  serial: "Serijski broj",
  systemType: "Tip sistema",
} as const;
export type ImportField = keyof typeof importFields;
export type ImportGrid = {
  headers: string[];
  rows: { number: number; cells: string[] }[];
};
export type ImportMapping = Partial<Record<ImportField, number>>;
export type ImportRow = {
  number: number;
  values: Partial<Record<ImportField, string>>;
  key: string;
  action: "new" | "matched" | "error";
  errors: string[];
  siteId: string | null;
  systemId: string | null;
  sites: { id: string; label: string }[];
  systems: { id: string; label: string }[];
  before: Record<string, unknown> | null;
};
export type ImportPreview = {
  id: string;
  digest: string;
  mapping: ImportMapping;
  resolutions: Record<string, { siteId?: string; systemId?: string }>;
  rows: ImportRow[];
  createdAt: string;
};
export type ImportApplication = {
  created: number;
  updated: number;
  skipped: number;
  appliedAt: string;
  digest: string;
  rows: {
    number: number;
    systemId: string;
    siteId: string;
    code: string;
    action: "created" | "updated" | "skipped";
  }[];
};
export type ImportDetail = {
  application: ImportApplication | null;
  id: string;
  filename: string;
  sourceDigest: string;
  contentDigest: string;
  grid: ImportGrid;
  createdAt: string;
  preview: ImportPreview | null;
};
export function suggestMapping(headers: string[]): ImportMapping {
  const result: ImportMapping = {};
  for (const [field, label] of Object.entries(importFields)) {
    const index = headers.findIndex((h) =>
      [field.toLowerCase(), label.toLowerCase()].includes(
        h.trim().toLowerCase(),
      ),
    );
    if (index >= 0) result[field as ImportField] = index;
  }
  return result;
}
