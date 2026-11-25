import { test, expect, type Page } from "@playwright/test";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today)$/);
}

test("office review returns a concrete correction, issues once and separates delivery, actions and billing", async ({ page, browser }, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture();
  const technician = await browser.newContext({ viewport: info.project.use.viewport });
  const worker = await workerClient();
  try {
    await login(page, "owner.a@hvac.example.invalid");
    await page.goto(`/visits/${fixture.visitId}/review`);
    await expect(page.getByLabel("Pregled rezultata", { exact: true }).getByRole("definition")).toHaveText(["4", "3", "2"]);
    const navigation = page.getByRole("navigation", { name: "Koraci kancelarijske obrade" });
    await navigation.getByRole("link", { name: "Odluka kancelarije", exact: true }).click();
    await expect(page).toHaveURL(/#review-decision$/);
    await page.getByLabel("Razlog dopune").fill("KL-01: potvrdite opis čišćenja.");
    await page.getByRole("button", { name: "Vrati na dopunu", exact: true }).click();
    await expect(page.getByText("Zatražena dopuna: KL-01: potvrdite opis čišćenja.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Izdaj izveštaj", exact: true })).toHaveCount(0);
    const tech = await technician.newPage();
    await login(tech, "technician.a@hvac.example.invalid");
    await tech.goto(`/visits/${fixture.visitId}`);
    await expect(tech.getByText("Zatražena dopuna: KL-01: potvrdite opis čišćenja.", { exact: true })).toBeVisible();
    const corrected = tech.getByRole("form", { name: "Unos KL-01", exact: true });
    const originalVersion = Number(await corrected.getAttribute("data-version"));
    await corrected.getByLabel("Obavljeni radovi", { exact: true }).fill("Čišćenje i pregled; potvrđena dopuna KL-01.");
    await corrected.getByRole("button", { name: "Sačuvaj KL-01", exact: true }).click();
    await expect(corrected).toHaveAttribute("data-version", String(originalVersion + 1));
    await tech.getByRole("button", { name: "Predaj kancelariji", exact: true }).click();
    await expect(tech.getByText("Stanje: Predato kancelariji", { exact: true })).toBeVisible();
    await page.goto(`/visits/${fixture.visitId}/review`);
    const actions = page.getByRole("link", { name: "Otvori radnju", exact: true });
    await expect(actions).toHaveCount(2);
    for (const index of [0, 1]) {
      const href = await actions.nth(index).getAttribute("href");
      await page.goto(href!);
      await expect(page.locator(".office-facts").getByText("Rok radnje", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Otvori izvorni sistem", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/visits/${fixture.visitId}/review#system-`));
    }
    await expect(page.getByRole("heading", { name: `Kancelarijski pregled · ${fixture.siteName}`, exact: true })).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByLabel("Pregled rezultata", { exact: true }).getByRole("definition")).toHaveText(["4", "3", "2"]);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`office-review-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Izdaj izveštaj", exact: true }).click();
    await expect(page).toHaveURL(/\/office\/reports\/[a-f0-9-]+$/);
    const revisionUrl = page.url();
    const id = revisionUrl.split("/").at(-1)!;
    await expect(page.getByText("Deljenje još nije dostupno. Priprema PDF-a ne stvara novu reviziju.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Napravi link za klijenta" })).toHaveCount(0);
    const job = await claimJob(worker, id);
    expect(job).not.toBeNull();
    await processJob(worker, job!);
    await expect(page.getByRole("link", { name: "Preuzmi PDF", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Napravi link za klijenta" })).toBeVisible();
    const download = await page.request.get(`/api/office/reports/${id}/pdf`);
    const preview = await page.request.get(`/api/office/reports/${id}/pdf?view=preview`);
    expect(download.status()).toBe(200);
    expect(preview.status()).toBe(200);
    expect(preview.headers()["content-disposition"]).toMatch(/^inline;/);
    expect(download.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect(preview.headers()["cache-control"]).toBe("private, no-store");
    expect(await preview.body()).toEqual(await download.body());
    expect((await tech.request.get(`/api/office/reports/${id}/pdf?view=preview`)).status()).toBe(404);
    await expect(page.getByRole("region", { name: "Evidencija prijema" })).toContainText("Nema potvrde prijema.");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`office-ready-${width}.png`), fullPage: true });
    }
    await page.getByRole("navigation", { name: "Koraci kancelarijske obrade" }).getByRole("link", { name: "Provera naplate", exact: true }).click();
    await page.getByLabel("Interna beleška o proveri").fill("Provereni rad i materijal; pripremiti obračun odvojeno.");
    await page.getByRole("button", { name: "Označi spremno za proveru naplate", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Označeno kao spremno");
    await page.goto(revisionUrl);
    await expect(page.getByRole("region", { name: "Evidencija prijema" })).toContainText("Nema potvrde prijema.");
    const counts = await fixture.db.query("select (select count(*)::int from public.report_revisions where visit_id=$1) revisions, (select count(*)::int from public.follow_ups f join public.visit_items i on i.id=f.item_id where i.visit_id=$1 and f.state='open') actions", [fixture.visitId]);
    expect(counts.rows[0]).toEqual({ revisions: 1, actions: 2 });
  } finally {
    await technician.close();
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
});
