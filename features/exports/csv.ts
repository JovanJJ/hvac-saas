import { zipSync, strToU8 } from "fflate";
import { columns, type Dataset, type ExportRow, type ExportSnapshot } from "./model";
export class ExportSizeError extends Error {}
const maxBytes = 32 * 1024 * 1024;
export function csvCell(value: ExportRow[string] | undefined): string {
  let text = value == null ? "" : String(value);
  // Quoting protects separators; a separate text prefix neutralizes spreadsheet formulas.
  if (typeof value === "string" && (
    /^[\s\u0000-\u001f\u007f-\u009f\uFEFF]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text)
  )) text = "\t" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function encodeCsv(dataset: Dataset, rows: ExportRow[]) {
  const fields = columns[dataset];
  const lines = [fields.map(([, label]) => csvCell(label)).join(";")];
  for (const row of rows) lines.push(fields.map(([key]) => csvCell(row[key])).join(";"));
  return strToU8("\uFEFF" + lines.join("\r\n") + "\r\n");
}
export function exportFiles(snapshot: ExportSnapshot, datasets: Dataset[]) {
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const dataset of datasets) {
    if (!snapshot.datasets[dataset]) throw new Error("incomplete_export");
    const file = encodeCsv(dataset, snapshot.datasets[dataset]!);
    bytes += file.byteLength;
    if (bytes > maxBytes) throw new ExportSizeError();
    files[`${dataset}.csv`] = file;
  }
  const scope = snapshot.siteId ? `site-${snapshot.siteId}` : `organization-${snapshot.organizationId}`;
  const date = snapshot.exportedAt.slice(0, 10);
  if (datasets.length === 1) return {
    bytes: files[`${datasets[0]}.csv`], contentType: "text/csv; charset=utf-8",
    filename: `teren-${datasets[0]}-${scope}-${date}.csv`,
  };
  const metadata = {
    schemaVersion: snapshot.schemaVersion, exportedAt: snapshot.exportedAt,
    organizationId: snapshot.organizationId, scope: snapshot.scope, siteId: snapshot.siteId,
    includesArchived: snapshot.includesArchived, counts: snapshot.counts,
  };
  files["manifest.json"] = strToU8(JSON.stringify({ ...metadata,
    files: datasets.map(id => ({ name: `${id}.csv`, rows: snapshot.datasets[id]!.length, columns: columns[id].map(([key, label]) => ({ key, label })) })),
    encoding: "UTF-8 with BOM", delimiter: ";", lineEnding: "CRLF",
    spreadsheetSafety: "Potential formula text is prefixed with U+0009 (TAB); quoted CSV escaping preserves delimiters and line breaks.",
  }, null, 2));
  return { bytes: zipSync(files, { level: 6 }), contentType: "application/zip", filename: `teren-export-${scope}-${date}.zip` };
}
