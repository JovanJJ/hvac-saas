import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { PDFDocument, PDFHexString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ReportDocument } from "@/features/reports/document";
import type { CustomerReport } from "@/features/reports/model";
export const rendererVersion = "service-report-v1/chromium-1255/1";
export const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function renderReport(
  report: CustomerReport,
  sources: Record<string, string> = {},
) {
  if (
    report.templateVersion !== "service-report-v1" ||
    report.schemaVersion !== 1
  )
    throw new Error("unsupported_template");
  if (!report.issuedAt || !report.revision || report.items.length > 500)
    throw new Error("render_limit");
  if (
    report.items.some((item) =>
      item.photos.some(
        (photo) => !sources[photo.id]?.startsWith("data:image/"),
      ),
    )
  )
    throw new Error("evidence_unavailable");
  const [regular, bold, css] = await Promise.all([
    readFile("features/reports/fonts/DejaVuSans.ttf"),
    readFile("features/reports/fonts/DejaVuSans-Bold.ttf"),
    readFile("features/reports/print.css", "utf8"),
  ]);
  const fontCss = `@font-face{font-family:TerenSans;src:url(data:font/ttf;base64,${regular.toString("base64")})} @font-face{font-family:TerenSans;font-weight:700;src:url(data:font/ttf;base64,${bold.toString("base64")})}`;
  const html =
    '<!doctype html><html lang="sr-Latn"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'"><style>' +
    fontCss +
    css +
    "</style></head><body>" +
    renderToStaticMarkup(
      <ReportDocument report={report} photoSources={sources} />,
    ) +
    "</body></html>";
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args:
      process.env.WORKER_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
  });
  const timeout = setTimeout(() => {
    void browser.close();
  }, 60000);
  let rendered: Buffer;
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: report.locale,
      timezoneId: report.timeZone,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(async () => {
      document
        .querySelectorAll("img")
        .forEach((img) => (img.loading = "eager"));
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((img) => img.decode()));
    });
    rendered = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
  const pdf = await PDFDocument.load(rendered, { updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(regular, {
    subset: true,
    customName: "TerenReportFooter",
  });
  const date = new Date(report.issuedAt);
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);
  pdf.setProducer(rendererVersion);
  pdf.setCreator(rendererVersion);
  pdf.setTitle(report.reference);
  const id = PDFHexString.of(
    digest(Buffer.from(JSON.stringify(report))).slice(0, 32),
  );
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  pdf.catalog.delete(pdf.context.obj("Metadata"));
  const pages = pdf.getPages();
  for (const [index, page] of pages.entries()) {
    page.drawLine({
      start: { x: 45, y: 36 },
      end: { x: page.getWidth() - 45, y: 36 },
      thickness: 0.5,
      color: rgb(0.7, 0.75, 0.72),
    });
    page.drawText(
      `${report.reference} · Revizija ${report.revision} · Strana ${index + 1}/${pages.length}`,
      { x: 45, y: 22, size: 8, font, color: rgb(0.15, 0.25, 0.2) },
    );
  }
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  if (bytes.length > 33554432) throw new Error("render_limit");
  return bytes;
}
