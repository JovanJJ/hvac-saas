import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { renderReport, rendererId } from "../src/worker/render";
import { publicReport } from "./fixtures/public-report";

const execute = promisify(execFile);
const output = "public/primeri";
const review = "test-results/public-report";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const temporary = await mkdtemp(join(tmpdir(), "teren-public-report-"));

  try {
    // Validate the deliberately public fixture without connecting to any service.
    assert.deepEqual(publicReport.totals, {
      planned: publicReport.items.filter(item => item.planned).length,
      inspected: publicReport.items.filter(item => ["serviced", "repair_needed"].includes(item.outcome)).length,
      actions: publicReport.items.filter(item => item.followUp?.state === "open").length,
    });
    assert.deepEqual(publicReport.totals, { planned: 4, inspected: 3, actions: 2 });
    assert.ok(publicReport.items.every(item => item.photos.length === 0));
    const pdf = await renderReport(publicReport);
    const filename = join(temporary, "sample.pdf");
    await writeFile(filename, pdf);
    const document = await PDFDocument.load(pdf, { updateMetadata: false });
    const { stdout: text } = await execute("pdftotext", ["-layout", filename, "-"], { maxBuffer: 16 * 1024 * 1024 });
    await mkdir(review, { recursive: true });
    await writeFile(join(review, "extracted-text.txt"), text);
    for (const phrase of ["RN-2026-0142", "JA-02", "izmišljeni", "Oštećen", "zaključana", "Čišćenje", "uređaja", "Čeka potvrdu klijenta."])
      assert.ok(text.toLocaleLowerCase("sr-Latn-RS").includes(phrase.toLocaleLowerCase("sr-Latn-RS")), `Missing searchable Serbian text: ${phrase}`);
    assert.ok(!/https?:|@|SECRET|internalNote|accessNote|token|password|cloudinary/i.test(text));
    assert.match(text, /Planirano\s+Pregledano\s+Otvorene radnje\s+4\s+3\s+2\b/);
    assert.equal(document.getTitle(), publicReport.reference);
    assert.equal(document.getAuthor(), undefined);
    assert.equal(document.getSubject(), undefined);
    const { stdout: fontInfo } = await execute("pdffonts", [filename]);
    const fontRows = fontInfo.trim().split("\n").slice(2);
    assert.ok(fontRows.length > 0, "Expected embedded fonts");
    for (const row of fontRows)
      assert.match(row, /yes\s+(?:yes|no)\s+yes/, "All fonts must be embedded and searchable");
    const pages = document.getPages();
    for (const [index, page] of pages.entries()) {
      assert.ok(Math.abs(page.getWidth() - 595.28) < 1 && Math.abs(page.getHeight() - 841.89) < 1, "Expected A4 pages");
      assert.ok(text.includes(`Strana ${index + 1}/${pages.length}`));
    }

    // Rasterize the actual PDF, never an independently recreated HTML preview.
    await execute("pdftoppm", ["-r", "144", "-png", filename, join(temporary, "page")], { maxBuffer: 1024 * 1024 });
    const firstPage = join(temporary, `page-${String(1).padStart(String(pages.length).length, "0")}.png`);
    const { stdout: bbox } = await execute("pdftotext", ["-f", "1", "-l", "1", "-bbox", filename, "-"], { maxBuffer: 16 * 1024 * 1024 });
    const words = Array.from(bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g), match => ({
      x: Number(match[1]), y: Number(match[2]), bottom: Number(match[4]), text: match[5],
    }));
    const tableCodes = ["KL-03", "KL-04", "KL-01", "KL-02"].map(code => {
      const word = words.find(word => word.text === code);
      assert.ok(word, `First page must include ${code}`);
      return word;
    });
    assert.ok(tableCodes.every((word, index) => index === 0 || word.y > tableCodes[index - 1].y));
    const totals = words.find(word => word.text === "Planirano");
    assert.ok(totals, "First page must include counters");
    const { width, height } = await sharp(firstPage).metadata();
    assert.ok(width && height);
    const scale = width / pages[0].getWidth();
    const left = Math.floor(40 * scale);
    const cropWidth = width - left * 2;
    const desktopTop = Math.floor(30 * scale);
    const desktopBottom = Math.ceil((tableCodes[3].bottom + 12) * scale);
    const mobileTop = Math.floor((totals.y - 10) * scale);
    const mobileBottom = Math.floor((tableCodes[2].y - 4) * scale);
    assert.ok(desktopBottom < height && mobileBottom > mobileTop);
    const crops = {
      desktop: { left, top: desktopTop, width: cropWidth, height: desktopBottom - desktopTop },
      mobile: { left, top: mobileTop, width: cropWidth, height: mobileBottom - mobileTop },
    };
    const previews: Record<string, { src: string; width: number; height: number; sha256: string }> = {};
    await mkdir(output, { recursive: true });
    await mkdir(review, { recursive: true });
    for (const [name, crop] of Object.entries(crops)) {
      const { data, info } = await sharp(firstPage).extract(crop).resize({ width: name === "desktop" ? 1200 : 900 }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
      const asset = `servisni-izvestaj-${name}.webp`;
      await writeFile(join(output, asset), data);
      previews[name] = { src: `/primeri/${asset}`, width: info.width, height: info.height, sha256: sha256(data) };
    }
    await writeFile(join(output, "servisni-izvestaj.pdf"), pdf);
    await writeFile(join(output, "servisni-izvestaj.json"), JSON.stringify({
      reference: publicReport.reference, revision: publicReport.revision, fictional: true,
      totals: publicReport.totals, pages: pages.length, renderer: rendererId(publicReport),
      pdf: { src: "/primeri/servisni-izvestaj.pdf", sha256: sha256(pdf), bytes: pdf.length },
      previews, crops,
    }, null, 2) + "\n");
    await writeFile(join(review, "extracted-text.txt"), text);
    await writeFile(join(review, "fonts.txt"), fontInfo);
    for (let index = 1; index <= pages.length; index++)
      await copyFile(join(temporary, `page-${String(index).padStart(String(pages.length).length, "0")}.png`), join(review, `page-${index}.png`));
    console.log(`Public fictional report: ${pages.length} A4 pages; searchable Serbian text, fonts, 4/3/2 and privacy checks passed.`);
    console.log(`Inspect every page in ${review}; previews share PDF SHA-256 ${sha256(pdf)}.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
