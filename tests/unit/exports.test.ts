import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { csvCell, encodeCsv, exportFiles } from "../../features/exports/csv";
import { exportSchema, type ExportSnapshot } from "../../features/exports/model";
import { safeDestination } from "../../features/auth/validation";
assert.equal(csvCell('Čačak; "đak"\nNovi red'), '"Čačak; ""đak""\nNovi red"');
for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", " \t=1", "\r=1", "\n=1", "\tplain", "＝1", "\uFEFF@x"]) {
  assert.ok(csvCell(value).startsWith('"\t'), value);
}
assert.equal(csvCell(-12), '"-12"');
assert.equal(csvCell(0), '"0"');
assert.equal(csvCell(false), '"false"');
assert.equal(csvCell(null), '""');
assert.equal(csvCell("000123"), '"000123"');
const bytes = encodeCsv("systems", [{ system_id: "stable-id", code: "Škola; test", serial: "000123", malicious_unlisted: "SHOULD-NOT-EXPORT" }]);
assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
assert.ok(strFromU8(bytes).includes('"Škola; test"'));
assert.ok(strFromU8(bytes).endsWith("\r\n"));
assert.ok(!strFromU8(bytes).includes("SHOULD-NOT-EXPORT"));
assert.equal(strFromU8(encodeCsv("visits", [])).split("\r\n").length, 2);
assert.equal(exportSchema.safeParse({ datasets: [], site: "" }).success, false);
assert.equal(exportSchema.safeParse({ datasets: ["systems", "systems"], site: "" }).success, false);
assert.equal(exportSchema.safeParse({ datasets: ["secrets"], site: "" }).success, false);
const snapshot: ExportSnapshot = { schemaVersion: 1, exportedAt: "2026-11-23T00:00:00Z", organizationId: "org", scope: "organization", siteId: null, includesArchived: true,
  counts: { customers: 0, sites: 0, systems: 1, units: 0, visits: 0, visit_items: 0 }, datasets: { systems: [{ system_id: "stable-id" }], visits: [] } };
const zip = exportFiles(snapshot, ["systems", "visits"]);
const files = unzipSync(zip.bytes);
assert.deepEqual(Object.keys(files).sort(), ["manifest.json", "systems.csv", "visits.csv"]);
assert.equal(JSON.parse(strFromU8(files["manifest.json"])).files[0].rows, 1);
assert.equal(JSON.parse(strFromU8(files["manifest.json"])).scope, "organization");
assert.ok(!Object.hasOwn(JSON.parse(strFromU8(files["manifest.json"])), "datasets"));
assert.equal(exportFiles(snapshot, ["systems"]).contentType, "text/csv; charset=utf-8");
assert.throws(() => exportFiles(snapshot, ["units"]), /incomplete_export/);
assert.equal(safeDestination("/settings/exports"), "/settings/exports");
