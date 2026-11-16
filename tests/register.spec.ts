import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
test("office creates register and assignment visible to technician", async ({
  page,
  browser,
}, testInfo) => {
  const ids: string[] = [];
  const tag = randomUUID().slice(0, 8);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const context = await browser.newContext({
    viewport: testInfo.project.use.viewport,
  });
  const tech = await context.newPage();
  async function login(p: typeof page, email: string) {
    await p.goto("/sign-in");
    await p.getByLabel("Email adresa").fill(email);
    await p
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await p.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(p).toHaveURL(/\/(office|today)$/);
  }
  async function save() {
    ids.push(await page.locator("input[name=operationId]").inputValue());
    await page.getByRole("button", { name: "Sačuvaj", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Sačuvano." }),
    ).toBeVisible();
  }
  try {
    await login(page, "owner.a@hvac.example.invalid");
    await page.goto("/customers");
    await page.getByLabel("Naziv klijenta").fill("Klijent " + tag);
    await save();
    await page.goto("/sites");
    await page
      .getByRole("combobox", { name: "Klijent", exact: true })
      .selectOption({ label: "Klijent " + tag });
    await page.getByLabel("Oznaka lokacije").fill(tag);
    await page.getByLabel("Naziv lokacije").fill("Lokacija " + tag);
    await page
      .getByLabel("Adresa", { exact: true })
      .fill("Primer 12, Jagodina");
    await save();
    await page.goto("/systems");
    await page
      .getByRole("combobox", { name: "Lokacija", exact: true })
      .selectOption({ label: tag.toUpperCase() + " · Lokacija " + tag });
    await page.getByLabel("Oznaka sistema").fill("KL-01");
    await page.getByLabel("Prostorija").fill("Recepcija");
    await save();
    await page.goto("/visits/new");
    await page
      .getByRole("combobox", { name: "Lokacija", exact: true })
      .selectOption({ label: tag.toUpperCase() + " · Lokacija " + tag });
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Belgrade",
    });
    await page.getByLabel("Početak", { exact: true }).fill(day + "T09:00");
    await page.getByLabel("Završetak", { exact: true }).fill(day + "T10:00");
    await page.getByRole("checkbox", { name: "KL-01 · Recepcija" }).check();
    await page.getByRole("button",{name:"Sačuvaj",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:"Proverite obavezna polja"})).toBeVisible();
    await expect(page.getByLabel("Početak",{exact:true})).toHaveValue(day+"T09:00");
    await expect(page.getByRole("checkbox",{name:"KL-01 · Recepcija"})).toBeChecked();
    await page
      .getByRole("checkbox", { name: "technician.a@hvac.example.invalid" })
      .check();
    await save();
    await login(tech, "technician.a@hvac.example.invalid");
    await expect(
      tech.getByRole("heading", { name: "Lokacija " + tag, exact: true }),
    ).toBeVisible();
    await expect(
      tech
        .getByRole("article")
        .filter({
          has: tech.getByRole("heading", {
            name: "Lokacija " + tag,
            exact: true,
          }),
        })
        .getByText("KL-01 · Recepcija"),
    ).toBeVisible();
    await tech.screenshot({
      path: testInfo.outputPath("today.png"),
      fullPage: true,
    });
    expect(
      await tech.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
    await db.query("begin");
    for (const table of ["visit_items", "visit_assignees"])
      await db.query(
        `delete from public.${table} where visit_id=any($1::uuid[])`,
        [ids],
      );
    for (const table of ["visits", "systems", "sites", "customers"])
      await db.query(`delete from public.${table} where id=any($1::uuid[])`, [
        ids,
      ]);
    await db.query(
      "delete from hvac_private.operation_receipts where operation_id=any($1::uuid[])",
      [ids],
    );
    await db.query("commit");
    await db.end();
  }
});
