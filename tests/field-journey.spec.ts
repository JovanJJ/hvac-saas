import { expect, test, type Page } from "@playwright/test";
import { createReportFixture } from "./report-fixture";

async function login(page: Page, email = "technician.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}

test("RN-2026-0142 offline journey links pending/owner corrections and confirms 4/3/2 once", async ({ page, context, browser }, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture({ submitted: false });
  const officeContext = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  try {
    await fixture.db.query("update public.visit_items set outcome='pending' where id=any($1::uuid[])", [[fixture.itemIds[0],fixture.itemIds[1],fixture.itemIds[3]]]);
    await login(page);
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.siteName, exact: true }) });
    await card.getByRole("button", { name: "Preuzmi za rad bez veze", exact: true }).click();
    await expect(card.getByText("Dostupno bez veze · lokalni unos", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, { waitUntil: "domcontentloaded" });
    const summary = page.getByRole("region", { name: "Pregled pre predaje", exact: true });
    await page.getByRole("button", { name: "Pripremi predaju kancelariji", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Unesite ishod za svaki sistem" })).toBeVisible();
    await summary.getByRole("link", { name: "KL-04: unesite ishod.", exact: true }).click();
    const fourth = page.getByRole("region", { name: "Unos KL-04", exact: true });
    await expect(fourth.getByLabel("Ishod", { exact: true })).toBeFocused();
    await fourth.getByLabel("Ishod", { exact: true }).selectOption("no_access");
    await expect(fourth.getByRole("status")).toContainText("Sačuvano na telefonu");
    await fourth.getByRole("button", { name: "Pripremi za slanje", exact: true }).click();
    await expect(fourth.getByRole("status")).toContainText("Čeka slanje");
    for (const code of ["KL-01", "KL-02"]) {
      const editor = page.getByRole("region", { name: `Unos ${code}`, exact: true });
      await editor.getByLabel("Ishod", { exact: true }).selectOption("serviced");
      await editor.getByLabel("Obavljeni radovi", { exact: true }).fill(`Čišćenje i provera bez veze · ${code}`);
      await expect(editor.getByRole("status")).toContainText("Sačuvano na telefonu");
      await editor.getByRole("button", { name: "Pripremi za slanje", exact: true }).click();
      await expect(editor.getByRole("status")).toContainText("Čeka slanje");
    }
    const third = page.getByRole("region", { name: "Unos KL-03", exact: true });
    await third.getByLabel("Ishod", { exact: true }).selectOption("repair_needed");
    await third.getByLabel("Odgovorni član tima", { exact: true }).selectOption("");
    await expect(third.getByRole("status")).toContainText("Sačuvano na telefonu");
    await third.getByRole("button", { name: "Pripremi za slanje", exact: true }).click();
    await page.getByRole("button", { name: "Pripremi predaju kancelariji", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "odgovorne članove tima" })).toBeVisible();
    await summary.getByRole("link", { name: "KL-03: izaberite odgovornog člana tima.", exact: true }).click();
    await expect(third.getByRole("button", { name: "Nastavi izmenu nacrta", exact: true })).toBeFocused();
    await third.getByRole("button", { name: "Nastavi izmenu nacrta", exact: true }).click();
    await third.getByLabel("Odgovorni član tima", { exact: true }).selectOption({ index: 1 });
    await expect(third.getByRole("status")).toContainText("Sačuvano na telefonu");
    await third.getByRole("button", { name: "Pripremi za slanje", exact: true }).click();
    await expect(third.getByRole("status")).toContainText("Čeka slanje");
    await expect(summary.locator("dd")).toHaveText(["4","3","2"]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Pregled pre predaje", exact: true }).locator("dd")).toHaveText(["4","3","2"]);
    await page.getByRole("button", { name: "Pripremi predaju kancelariji", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Predaja čeka slanje" })).toBeVisible();
    for (const width of [360,1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("region", { name: "Pregled pre predaje", exact: true }).screenshot({ path: info.outputPath(`summary-${width}.png`) });
    }
    await context.setOffline(false);
    await expect(page.getByText("Poseta je predata ili izdata. Dostupan je samo pregled.", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("region", { name: "Pregled predate posete", exact: true })).toContainText("Predato kancelariji");
    const after = (await fixture.db.query("select version,status from public.visits where id=$1", [fixture.visitId])).rows[0];
    expect(after.status).toBe("submitted");
    expect(after.version).toBe(fixture.version + 5);
    await expect(page.getByRole("button", { name: "Sinhronizuj sada", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Sinhronizuj sada", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sinhronizuj sada", exact: true })).toBeEnabled();
    expect((await fixture.db.query("select version from public.visits where id=$1", [fixture.visitId])).rows[0].version).toBe(after.version);
    const office = await officeContext.newPage();
    await login(office, "owner.a@hvac.example.invalid");
    await office.goto(`/visits/${fixture.visitId}/review`);
    await expect(office.locator('dl[aria-label="Pregled rezultata"] dd')).toHaveText(["4","3","2"]);
  } finally { await officeContext.close(); await context.setOffline(false); await fixture.dispose(); }
});
