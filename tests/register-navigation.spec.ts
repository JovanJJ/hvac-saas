import { expect, test, type Page } from "@playwright/test";
import { createReportFixture } from "./report-fixture";
import { createVerificationFixture } from "./auth-fixtures";

async function login(page: Page, email = "owner.a@hvac.example.invalid", password = process.env.SEED_PASSWORD!) {
  page.setDefaultTimeout(10000);
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today)$/);
}

test("register identity search, hierarchy, site actions, archived choices and field-only history", async ({ page, browser }, info) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture();
  const unassigned = await createVerificationFixture();
  const systemId = fixture.systemIds[2];
  const tag = fixture.siteId.slice(0, 8);
  const room = `Duga prostorija Čačak ${tag} · ${"Učionica sa veoma dugim nazivom ".repeat(2)}`.slice(0, 120);
  const serial = `UX10-${tag}-${"1234567890".repeat(8)}`;
  const techContext = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const otherContext = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  try {
    await fixture.db.query("update auth.users set email_confirmed_at=now() where id=$1", [unassigned.id]);
    await fixture.db.query("insert into public.memberships(organization_id,user_id,role) values($1,$2,'technician')", [fixture.org,unassigned.id]);
    await fixture.db.query("update public.systems set code=$1,room=$2,serial=$3 where id=$4", [`UX10-${tag}`,room,serial,systemId]);
    await login(page);
    await page.goto("/systems");
    const list = page.getByRole("region", { name: "Sačuvani zapisi", exact: true });
    const search = list.getByRole("searchbox");
    for (const query of [`UX10-${tag}`, room, serial]) {
      await search.fill(query);
      await expect(list.getByRole("article")).toHaveCount(1);
      await expect(list.getByRole("article")).toContainText(room);
    }
    await list.getByRole("link", { name: "Otvori detalje", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/systems/${systemId}$`));
    const breadcrumbs = page.getByRole("navigation", { name: "Putanja", exact: true });
    await expect(breadcrumbs.locator(`a[href="/customers/${fixture.customerId}"]`)).toBeVisible();
    await expect(breadcrumbs.locator(`a[href="/sites/${fixture.siteId}"]`)).toBeVisible();
    await expect(page.getByRole("region", { name: "Otvorene radnje · 1", exact: true })).toContainText("Oštećen deflektor");
    await expect(page.getByRole("main").getByRole("link", { name: "Zakaži posetu", exact: true })).toHaveAttribute("href", `/visits/new?site=${fixture.siteId}`);
    await page.getByRole("navigation", { name: "Odeljci zapisa" }).getByRole("link", { name: "Servisna istorija", exact: true }).click();
    await expect(page.locator("#service-history")).toBeFocused();
    await page.getByRole("navigation", { name: "Odeljci zapisa" }).getByRole("link", { name: "Uredi podatke", exact: true }).click();
    await expect(page.locator("#register-edit")).toBeFocused();
    const edit = page.getByRole("form", { name: "Uredi podatke", exact: true });
    await edit.getByLabel("Prostorija", { exact: true }).fill("   ");
    await edit.getByRole("button", { name: "Sačuvaj izmene", exact: true }).click();
    await expect(edit.getByText("Obavezno polje.", { exact: true })).toBeVisible();
    await expect(edit.getByLabel("Prostorija", { exact: true })).toHaveValue("   ");
    await expect(edit.getByLabel("Serijski broj", { exact: true })).toHaveValue(serial);
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`system-${width}.png`), fullPage: true });
    }
    await page.getByRole("navigation", { name: "Putanja" }).locator(`a[href="/sites/${fixture.siteId}"]`).click();
    await expect(page.getByRole("main").getByRole("link", { name: "Dodaj sistem", exact: true })).toHaveAttribute("href", `/systems?site=${fixture.siteId}#new-record`);
    await expect(page.getByRole("navigation", { name: "Prenos podataka registra" }).getByRole("link", { name: "Izvoz podataka" })).toHaveAttribute("href", `/settings/exports?site=${fixture.siteId}`);
    await page.getByRole("main").getByRole("link", { name: "Dodaj sistem", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Lokacija", exact: true })).toHaveValue(fixture.siteId);
    await expect(page.getByRole("combobox", { name: "Lokacija za pregled", exact: true })).toHaveValue(fixture.siteId);
    await page.goto(`/customers/${fixture.customerId}`);
    await page.getByRole("main").getByRole("link", { name: "Dodaj lokaciju", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Klijent", exact: true })).toHaveValue(fixture.customerId);
    await fixture.db.query("update public.systems set archived_at=now() where id=$1", [systemId]);
    await page.goto("/systems");
    const archivedList = page.getByRole("region", { name: "Sačuvani zapisi", exact: true });
    await archivedList.getByRole("searchbox").fill(serial);
    await expect(archivedList.getByRole("article")).toHaveCount(0);
    await archivedList.getByRole("checkbox", { name: "Prikaži arhivirane zapise" }).check();
    await expect(archivedList.getByRole("article")).toHaveCount(1);
    await expect(archivedList.getByRole("article")).toContainText("Arhivirano");
    await fixture.db.query("update public.sites set archived_at=now() where id=$1", [fixture.siteId]);
    await page.goto(`/systems?site=${fixture.siteId}`);
    await expect(page.getByRole("alert").filter({ hasText: "nije dostupan za novi unos" })).toBeVisible();
    await expect(page.locator('form input[name="kind"][value="system"]')).toHaveCount(0);
    await fixture.db.query("update public.sites set archived_at=null where id=$1", [fixture.siteId]);
    const tech = await techContext.newPage();
    await login(tech, "technician.a@hvac.example.invalid");
    await tech.goto(`/systems/${systemId}`);
    await expect(tech.getByRole("region", { name: "Servisna istorija", exact: true })).toContainText("Oštećen deflektor");
    await expect(tech.getByRole("navigation", { name: "Putanja" }).getByRole("link")).toHaveCount(1);
    await expect(tech.getByRole("navigation", { name: "Prenos podataka registra" })).toHaveCount(0);
    await expect(tech.getByRole("form", { name: "Uredi podatke", exact: true })).toHaveCount(0);
    await tech.goto(`/sites/${fixture.siteId}`);
    await expect(tech.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    await login(tech, unassigned.email, unassigned.password);
    await tech.goto(`/systems/${systemId}`);
    await expect(tech.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    const other = await otherContext.newPage();
    await login(other, "owner.b@hvac.example.invalid");
    await other.goto(`/systems/${systemId}`);
    await expect(other.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
  } finally {
    await Promise.all([techContext.close(),otherContext.close()]);
    await fixture.db.query("delete from hvac_private.register_events where organization_id=$1 and entity_id=any($2::uuid[])", [fixture.org,[fixture.customerId,fixture.siteId,...fixture.systemIds]]);
    await fixture.dispose();
    await unassigned.dispose();
  }
});
