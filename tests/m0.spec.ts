import { expect, test, type Page } from "@playwright/test";

async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function openItem(page: Page, code: string) {
  await page
    .getByRole("button", { name: new RegExp("^" + code + " ") })
    .click();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Sačuvaj i vrati se" }).click();
  await expect(
    page.getByRole("heading", { name: "Radna poseta", exact: true }),
  ).toBeVisible();
}
async function assertTotals(page: Page) {
  const totals = page.getByRole("definition");
  await expect(totals).toHaveText(["4", "3", "2"]);
}

test("four-system journey, validation, customer isolation and reset", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Danas", exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("today.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kancelarija", exact: false }).click();
  await expect(page.getByText("Nema poseta za proveru")).toBeVisible();
  await page
    .getByRole("button", { name: "Otvori posetu", exact: true })
    .click();
  await page.getByRole("button", { name: "Pregledaj i predaj" }).click();
  await page.getByRole("button", { name: "Predaj na proveru" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Izaberite/ }),
  ).toContainText("KL-04: Izaberite ishod");
  await page
    .getByRole("button", { name: "KL-01: Izaberite ishod za ovaj sistem." })
    .click();
  await page.getByLabel("Servisirano", { exact: true }).check();
  await page
    .getByLabel("Obavljeni radovi")
    .fill("Očišćeni filteri i proveren rad.");
  await page.getByLabel("Interna beleška").fill("PRIVATNO-NE-PRIKAZUJ");
  await save(page);
  await openItem(page, "KL-02");
  await page.getByLabel("Servisirano", { exact: true }).check();
  await page.getByLabel("Obavljeni radovi").fill("Očišćeni filteri.");
  await page.getByLabel("Status merenja").selectOption("measured");
  await page.getByLabel("Vrednost (°C)").fill("12,5");
  await page
    .getByRole("button", { name: "Nazad na posetu", exact: true })
    .click();
  await openItem(page, "KL-02");
  await expect(page.getByLabel("Vrednost (°C)")).toHaveValue("12,5");
  await page.getByLabel("Vrednost (°C)").fill("0");
  await save(page);
  await openItem(page, "KL-03");
  await page.getByLabel("Potrebna popravka", { exact: true }).check();
  await page.getByLabel("Nalaz za klijenta").fill("Oštećen usmerivač vazduha.");
  await page
    .getByLabel("Sledeći korak")
    .fill("Pripremiti ponudu za zamenu usmerivača.");
  await page.getByLabel("Rok", { exact: true }).fill("2026-11-20");
  await page.getByRole("button", { name: "Sačuvaj i vrati se" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Izaberite/ }),
  ).toContainText("Izaberite odgovornu osobu.");
  await expect(page.getByLabel("Nalaz za klijenta")).toHaveValue(
    "Oštećen usmerivač vazduha.",
  );
  await page
    .getByRole("button", { name: "Nazad na posetu", exact: true })
    .click();
  await openItem(page, "KL-04");
  await page.getByLabel("Nema pristupa", { exact: true }).check();
  await expect(page.getByLabel("Status merenja")).toHaveCount(0);
  await page.getByLabel("Razlog nedostupnosti").fill("Arhiva je zaključana.");
  await page
    .getByLabel("Sledeći korak")
    .fill("Dogovoriti pristup sa predstavnikom lokacije i ponovnu posetu.");
  await page.getByLabel("Odgovorna osoba").selectOption("Marko Petrović");
  await page.getByLabel("Rok", { exact: true }).fill("2026-11-23");
  await save(page);
  await page.getByRole("button", { name: "Pregledaj i predaj" }).click();
  await page.getByRole("button", { name: "Predaj na proveru" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Izaberite/ }),
  ).toContainText("KL-03: Izaberite odgovornu osobu.");
  await page
    .getByRole("button", { name: "KL-03: Izaberite odgovornu osobu." })
    .click();
  await page.getByLabel("Odgovorna osoba").selectOption("Jelena Jovanović");
  await save(page);
  await page.getByRole("button", { name: "Pregledaj i predaj" }).click();
  await assertTotals(page);
  await page.getByRole("button", { name: "Predaj na proveru" }).click();
  await expect(
    page.getByRole("heading", { name: "Kancelarijska provera", exact: true }),
  ).toBeVisible();
  await assertTotals(page);
  await expect(
    page.getByText("Interna beleška: PRIVATNO-NE-PRIKAZUJ"),
  ).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("office.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pregled za klijenta" }).click();
  await assertTotals(page);
  const report = page.getByRole("article", {
    name: "Pregled izveštaja za klijenta",
  });
  await expect(report).toContainText("0 °C");
  await expect(report).toContainText("Nije mereno");
  await expect(report).toContainText("Nije pregledano — nema pristupa.");
  await expect(report).toContainText("Čeka potvrdu");
  await expect(report).not.toContainText("PRIVATNO-NE-PRIKAZUJ");
  await expect(report).not.toContainText("Za pristup arhivi");
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("report.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Počni ponovo" }).click();
  await page.getByRole("button", { name: "Otvori posetu" }).click();
  await expect(page.getByText("Čeka unos", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("definition")).toHaveText(["4", "0", "0"]);
  await expect(
    page.getByRole("heading", { name: "Radna poseta", exact: true }),
  ).toBeFocused();
  expect(browserErrors).toEqual([]);
});
