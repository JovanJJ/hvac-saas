import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import sample from "../public/primeri/servisni-izvestaj.json";

test("anonymous public sample and crops match the reviewed publication", async ({ request }) => {
  const response = await request.get(sample.pdf.src);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const bytes = await response.body();
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sample.pdf.sha256);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(pdf.getTitle()).toBe("RN-2026-0142");
  expect(pdf.getPageCount()).toBe(sample.pages);
  expect(pdf.getAuthor()).toBeUndefined();
  expect(pdf.getSubject()).toBeUndefined();
  expect(sample.fictional).toBe(true);
  expect(sample.totals).toEqual({ planned: 4, inspected: 3, actions: 2 });
  for (const preview of Object.values(sample.previews)) {
    const image = await request.get(preview.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/webp");
    expect(createHash("sha256").update(await image.body()).digest("hex")).toBe(preview.sha256);
  }
});
