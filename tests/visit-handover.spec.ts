import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";

test("four systems persist from Today through office handover and customer preview", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const org = "a1000000-0000-4000-8000-000000000001";
  const owner = "a1000000-0000-4000-8000-000000000101";
  const ids = Array.from({ length: 7 }, () => randomUUID());
  const [customer, site, ...rest] = ids;
  const systems = rest.slice(0, 4),
    visit = ids[6];
  const tag = site.slice(0, 8);
  const officeContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
  });
  const office = await officeContext.newPage();
  async function login(p: Page, email: string) {
    await p.goto("/sign-in");
    await p.getByLabel("Email adresa").fill(email);
    await p
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await p.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(p).toHaveURL(/\/(office|today)$/);
  }
  async function create(id: string, kind: string, data: unknown) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await db.query("select public.save_operation($1,$2,$3,$4::jsonb)", [
        org,
        id,
        kind,
        JSON.stringify(data),
      ]);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  const form = (code: string) =>
    page.getByRole("form", { name: `Unos ${code}`, exact: true });
  async function save(code: string) {
    const version = Number(await form(code).getAttribute("data-version"));
    await form(code)
      .getByRole("button", { name: `Sačuvaj ${code}` })
      .click();
    await expect(form(code)).toHaveAttribute(
      "data-version",
      String(version + 1),
    );
    await expect(form(code).getByText(/Sačuvano na serveru/)).toBeVisible();
  }
  try {
    const members = await db.query(
      "select id from public.memberships where organization_id=$1 and user_id='a1000000-0000-4000-8000-000000000102' and active",
      [org],
    );
    await create(customer, "customer", { name: "Fiktivni klijent " + tag });
    await create(site, "site", {
      customerId: customer,
      name: "Jagodina " + tag,
      code: tag,
      address: "Primer 14, Jagodina",
      timeZone: "Europe/Belgrade",
      accessNote: "PRIVATNI-PRISTUP-9876",
    });
    for (const [index, id] of systems.entries())
      await create(id, "system", {
        siteId: site,
        code: `KL-0${index + 1}`,
        room: index === 3 ? "Arhiva" : "Prostorija " + (index + 1),
      });
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Belgrade",
    });
    await create(visit, "visit", {
      siteId: site,
      visitType: "maintenance",
      start: day + "T09:00",
      end: day + "T12:00",
      systems,
      members: [members.rows[0].id],
    });
    await login(page, "technician.a@hvac.example.invalid");
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Jagodina " + tag,
          exact: true,
        }),
      })
      .getByRole("link", { name: "Otvori posetu" })
      .click();
    await form("KL-01")
      .getByRole("combobox", { name: "Ishod", exact: true })
      .selectOption("serviced");
    await form("KL-01").getByLabel("Obavljeni radovi").fill("Čišćenje filtera");
    await form("KL-01")
      .getByLabel("Interna beleška (ne ulazi u izveštaj)")
      .fill("INTERNO-NE-OBJAVI");
    await save("KL-01");
    await page
      .getByRole("button", { name: "Predaj kancelariji", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Unesite ishod" }),
    ).toHaveText("Unesite ishod za svaki sistem.");
    await form("KL-02")
      .getByRole("combobox", { name: "Ishod", exact: true })
      .selectOption("serviced");
    await form("KL-02")
      .getByText("Merenja i materijal", { exact: true })
      .click();
    await form("KL-02")
      .getByRole("combobox", { name: "Struja — status" })
      .selectOption("measured");
    await form("KL-02").getByLabel("Struja (A)", { exact: true }).fill("0,0");
    await form("KL-02").getByLabel("Materijal / deo").fill("Filter");
    await form("KL-02").getByLabel("Količina", { exact: true }).fill("2");
    await form("KL-02")
      .getByRole("button", { name: "Dodaj materijal", exact: true })
      .click();
    const secondPart = form("KL-02").getByRole("group", {
      name: "Materijal 2",
      exact: true,
    });
    await secondPart.getByLabel("Materijal / deo").fill("Sredstvo");
    await secondPart.getByLabel("Količina", { exact: true }).fill("0,5");
    await secondPart.getByLabel("Jedinica materijala").fill("l");
    await save("KL-02");
    await form("KL-03")
      .getByRole("combobox", { name: "Ishod", exact: true })
      .selectOption("repair_needed");
    await form("KL-03")
      .getByLabel("Nalaz za klijenta")
      .fill("Oštećen deflektor; potrebna ponuda.");
    await form("KL-03").getByText("Sledeća radnja", { exact: true }).click();
    await form("KL-03")
      .getByRole("combobox", { name: "Vrsta radnje" })
      .selectOption("quote");
    await form("KL-03").getByLabel("Rok", { exact: true }).fill("2026-12-10");
    await save("KL-03");
    await form("KL-04")
      .getByRole("combobox", { name: "Ishod", exact: true })
      .selectOption("no_access");
    await form("KL-04")
      .getByLabel("Razlog bez pristupa")
      .fill("Zaključana arhiva");
    await form("KL-04").getByText("Sledeća radnja", { exact: true }).click();
    await form("KL-04")
      .getByRole("combobox", { name: "Vrsta radnje" })
      .selectOption("revisit");
    await form("KL-04")
      .getByRole("combobox", { name: "Odgovorni član tima" })
      .selectOption({ index: 1 });
    await form("KL-04").getByLabel("Rok", { exact: true }).fill("2026-12-11");
    await form("KL-04")
      .getByLabel("Šta se očekuje od klijenta")
      .fill("Obezbediti ključ arhive");
    await save("KL-04");
    await page
      .getByRole("button", { name: "Predaj kancelariji", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "odgovorne članove" }),
    ).toContainText("odgovorne članove tima");
    await expect(
      page.getByText("KL-03: izaberite odgovornog člana tima i rok."),
    ).toBeVisible();
    await form("KL-03")
      .getByRole("combobox", { name: "Odgovorni član tima" })
      .selectOption({ index: 1 });
    await save("KL-03");
    await page.reload();
    await expect(
      form("KL-02").getByRole("combobox", { name: "Ishod", exact: true }),
    ).toHaveValue("serviced");
    await page
      .getByRole("button", { name: "Predaj kancelariji", exact: true })
      .click();
    await expect(
      page.getByText("Stanje: Predato kancelariji", { exact: true }),
    ).toBeVisible();
    await login(office, "owner.a@hvac.example.invalid");
    await office
      .getByRole("link", {
        name: "Jagodina " + tag + " · Otvori pregled",
        exact: true,
      })
      .click();
    const totals = office.getByRole("definition");
    await expect(totals).toHaveText(["4", "3", "2"]);
    await office
      .getByRole("link", { name: "Pregled za klijenta", exact: true })
      .click();
    const report = office.getByRole("article", {
      name: "Nacrt servisnog izveštaja",
    });
    await expect(report.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(
      report.getByText("Struja: 0 A · Hlađenje", { exact: true }),
    ).toBeVisible();
    await expect(
      report.getByText("Zaključana arhiva", { exact: false }),
    ).toBeVisible();
    await expect(
      report.getByText("Materijal: Filter · 2 kom", { exact: true }),
    ).toBeVisible();
    await expect(report).not.toContainText("PRIVATNI-PRISTUP");
    await expect(
      report.getByText("Materijal: Sredstvo · 0,5 l", { exact: true }),
    ).toBeVisible();
    await expect(report).not.toContainText("INTERNO-NE-OBJAVI");
    await office.screenshot({
      path: testInfo.outputPath("customer-preview.png"),
      fullPage: true,
    });
    expect(
      await office.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await office
      .getByRole("link", { name: "Nazad na pregled", exact: true })
      .click();
    await office.getByLabel("Razlog dopune").fill("Dopunite opis čišćenja");
    await office
      .getByRole("button", { name: "Vrati na dopunu", exact: true })
      .click();
    await expect(
      office.getByText("Zatražena dopuna: Dopunite opis čišćenja"),
    ).toBeVisible();
    await page.reload();
    await expect(form("KL-01")).toBeVisible();
    await form("KL-01")
      .getByLabel("Obavljeni radovi")
      .fill("Čišćenje i dezinfekcija filtera");
    await save("KL-01");
    await page
      .getByRole("button", { name: "Predaj kancelariji", exact: true })
      .click();
    await expect(
      page.getByText("Stanje: Predato kancelariji", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("submitted.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await office.goto("/sign-in");
    // A separate identity cannot retrieve this staff deep link.
    await officeContext.clearCookies();
    await login(office, "owner.b@hvac.example.invalid");
    await office.goto(`/visits/${visit}/review`);
    await expect(
      office.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
  } finally {
    await officeContext.close();
    await db.query("begin");
    await db.query(
      "delete from hvac_private.visit_corrections where visit_id=$1",
      [visit],
    );
    await db.query(
      "delete from public.follow_ups where item_id in(select id from public.visit_items where visit_id=$1)",
      [visit],
    );
    await db.query("delete from public.visit_items where visit_id=$1", [visit]);
    await db.query("delete from public.visit_assignees where visit_id=$1", [
      visit,
    ]);
    await db.query(
      "delete from hvac_private.identity_events where subject_id=$1",
      [visit],
    );
    await db.query(
      "delete from hvac_private.operation_receipts where payload->>'visit'=$1 or operation_id=any($2::uuid[])",
      [visit, ids],
    );
    for (const table of ["visits", "systems", "sites", "customers"])
      await db.query(`delete from public.${table} where id=any($1::uuid[])`, [
        ids,
      ]);
    await db.query("commit");
    await db.end();
  }
});
