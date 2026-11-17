// Requires Poppler (pdfinfo, pdftotext, pdffonts, pdftoppm) on PATH.
// Run after the desktop print integration fixture. Images need visual review.
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const execute = promisify(execFile);
const dir = process.env.PDF_REVIEW_DIRECTORY || "/tmp/hvac-pdf-review";
for (const count of [1, 4, 30]) {
  const filename = `${dir}/${count}-systems.pdf`;
  const metadata = JSON.parse(
    await readFile(`${dir}/${count}-systems.json`, "utf8"),
  );
  const { stdout: info } = await execute("pdfinfo", [filename]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  assert.ok(pages > 0);
  const { stdout: text } = await execute("pdftotext", [
    "-layout",
    filename,
    "-",
  ]);
  await writeFile(`${dir}/${count}-systems.txt`, text);
  const contents = text.split("\f").filter((page) => page.trim());
  assert.equal(contents.length, pages);
  for (const [index, page] of contents.entries()) {
    assert.ok(page.includes(metadata.reference));
    assert.ok(page.includes(`Strana ${index + 1}/${pages}`));
  }
  for (let i = 1; i <= count; i++)
    assert.match(text, new RegExp(`\\bKL-${String(i).padStart(2, "0")}\\b`));
  assert.ok(text.includes("ČĆŠŽĐ čćšžđ"));
  assert.ok(!text.includes("SECRET"));
  assert.match(text, /Čeka potvrdu klijenta/);
  const { planned, inspected, actions } = metadata.totals;
  assert.match(
    text,
    new RegExp(
      `Planirano\\s+Pregledano\\s+Otvorene radnje\\s+${planned}\\s+${inspected}\\s+${actions}\\b`,
    ),
  );
  if (count === 4) {
    assert.deepEqual(metadata.totals, { actions: 2, planned: 4, inspected: 3 });
    assert.match(text, /Struja: 0 A/);
    assert.match(text, /Nije mereno/);
    assert.match(text, /Čist filter · potvrđena fotografija čćšžđ/);
  }
  if (count === 30)
    for (const page of contents.slice(0, 2))
      assert.match(page, /Sistem\s+Prostorija\s+Ishod\s+Sledeća radnja/);
  const { stdout: fonts } = await execute("pdffonts", [filename]);
  const rows = fonts.trim().split("\n").slice(2);
  assert.ok(rows.length > 0);
  for (const row of rows)
    assert.match(
      row,
      /yes\s+(?:yes|no)\s+yes/,
      "Every font must be embedded and searchable",
    );
  await execute("pdftoppm", [
    "-scale-to",
    "850",
    "-png",
    filename,
    `${dir}/${count}-page`,
  ]);
  console.log(
    `PASS: ${count} systems, ${pages} pages, totals, Serbian text, identifiers, embedded fonts and page numbering. Inspect every generated page image.`,
  );
}
