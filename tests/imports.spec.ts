import { openStaffMenu } from "./staff-controls";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { createReportFixture } from "./report-fixture";
async function login(page: Page, email = "owner.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today)$/);
}
async function api(email: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email,
        password: process.env.SEED_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  return client;
}
test("CSV preview resolves ambiguity, remaps columns and leaves register and findings unchanged", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture();
  const batchIds: string[] = [];
  const duplicate = randomUUID();
  try {
    const code = "M5C " + fixture.siteId.slice(0, 8).toUpperCase();
    await fixture.db.query("update public.sites set code=$1 where id=$2", [
      code,
      fixture.siteId,
    ]);
    await fixture.db.query(
      "insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values($1,$2,$3,$4,'Fiktivna druga lokacija','Primer','Europe/Belgrade')",
      [duplicate, fixture.org, fixture.customerId, code.replace(" ", "  ")],
    );
    const before = (
      await fixture.db.query(
        "select to_jsonb(s) data from public.systems s where site_id=$1 order by id",
        [fixture.siteId],
      )
    ).rows;
    const findings = (
      await fixture.db.query(
        "select to_jsonb(i) data from public.visit_items i where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    await login(page);
    await (await openStaffMenu(page)).getByRole("link", { name: "Uvoz opreme", exact: true }).click();
    await page.getByLabel("CSV ili XLSX fajl").setInputFiles({
      name: "fiktivna-oprema.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `Oznaka lokacije;Oznaka sistema;Prostorija;Serijski broj\n${code};kl-01;Nova prostorija;00023\n${code};KL-05;Čačak, šuma;00024\n${code};;Nedostaje oznaka;\n`,
      ),
    });
    await page.getByRole("button", { name: "Učitaj za pregled" }).click();
    await expect(page).toHaveURL(/\/imports\/[a-f0-9-]+$/);
    batchIds.push(page.url().split("/").at(-1)!);
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(
      page.getByRole("heading", { name: "Rezultat pregleda" }),
    ).toBeVisible();
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "Više lokacija",
    );
    for (const number of [2, 3, 4])
      await page
        .getByRole("combobox", {
          name: `Lokacija za red ${number}`,
          exact: true,
        })
        .selectOption(fixture.siteId);
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "Pronađen sistem",
    );
    await expect(page.getByRole("article", { name: "Red 3" })).toContainText(
      "Novi sistem",
    );
    await expect(page.getByRole("article", { name: "Red 4" })).toContainText(
      "Potrebna ispravka",
    );
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "00023",
    );
    const firstDigest = await page.getByRole("main").locator("details").filter({ has: page.locator("summary").filter({ hasText: "Identifikator sačuvanog pregleda" }) }).locator("p").textContent();
    await page
      .getByRole("combobox", { name: "Serijski broj", exact: true })
      .selectOption("");
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(
      page
        .getByRole("article", { name: "Red 2" })
        .getByText("Serijski broj", { exact: true }),
    ).toHaveCount(0);
    expect(await page.getByRole("main").locator("details").filter({ has: page.locator("summary").filter({ hasText: "Identifikator sačuvanog pregleda" }) }).locator("p").textContent()).not.toBe(firstDigest);
    await page.reload();
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "Pronađen sistem",
    );
    await expect(
      page.getByText("Registar nije promenjen.", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("import-preview.png"),
      fullPage: true,
    });
    expect(
      (
        await fixture.db.query(
          "select to_jsonb(s) data from public.systems s where site_id=$1 order by id",
          [fixture.siteId],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await fixture.db.query(
          "select to_jsonb(i) data from public.visit_items i where visit_id=$1 order by id",
          [fixture.visitId],
        )
      ).rows,
    ).toEqual(findings);
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const client = await api(email);
      expect(
        (
          await client.rpc("import_detail", {
            p_organization_id: fixture.org,
            p_batch_id: batchIds[0],
          })
        ).error?.code,
      ).toBe("42501");
    }
    const technician = await browser.newContext();
    try {
      const fieldPage = await technician.newPage();
      await login(fieldPage, "technician.a@hvac.example.invalid");
      await fieldPage.goto(`/imports/${batchIds[0]}`);
      await expect(
        fieldPage.getByRole("heading", { name: "Stranica nije dostupna" }),
      ).toBeVisible();
    } finally {
      await technician.close();
    }
    // Correcting the file makes a distinct batch; the old reviewed snapshot is retained.
    await page.goto("/imports");
    await page.getByLabel("CSV ili XLSX fajl").setInputFiles({
      name: "ispravljeno.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`siteCode,systemCode,room\n${code},KL-05,Šuma\n`),
    });
    await page.getByRole("button", { name: "Učitaj za pregled" }).click();
    await expect(page).toHaveURL(/\/imports\/[a-f0-9-]+$/);
    batchIds.push(page.url().split("/").at(-1)!);
    expect(batchIds[1]).not.toBe(batchIds[0]);
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await page
      .getByRole("combobox", { name: "Lokacija za red 2", exact: true })
      .selectOption(fixture.siteId);
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "Novi sistem",
    );
    await expect(
      page.getByText("Mapiranje ili izbor su promenjeni.", { exact: false }),
    ).toHaveCount(0);

    const saved = await fixture.db.query(
      "select count(*)::int count from hvac_private.import_previews where organization_id=$1 and batch_id=$2",
      [fixture.org, batchIds[0]],
    );
    expect(saved.rows[0].count).toBe(3);
  } finally {
    await fixture.db.query(
      "delete from hvac_private.import_previews where organization_id=$1 and batch_id=any($2::uuid[])",
      [fixture.org, batchIds],
    );
    await fixture.db.query(
      "delete from hvac_private.import_batches where organization_id=$1 and id=any($2::uuid[])",
      [fixture.org, batchIds],
    );
    await fixture.db.query("delete from public.sites where id=$1", [duplicate]);
    await fixture.dispose();
  }
});
test("XLSX upload maps one sheet and blocks formula files without creating an upload", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture();
  let batch: string | undefined;
  const sheet = (formula = false) =>
    `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>siteCode</t></is></c><c r="B1" t="inlineStr"><is><t>systemCode</t></is></c><c r="C1" t="inlineStr"><is><t>room</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${fixture.siteId.slice(0, 8).toUpperCase()}</t></is></c><c r="B2" t="inlineStr"><is><t>KL-06</t></is></c><c r="C2" t="inlineStr">${formula ? "<f>1+1</f>" : ""}<is><t>Šuma</t></is></c></row></sheetData></worksheet>`;
  const bytes = (formula = false) =>
    Buffer.from(
      zipSync({
        "xl/workbook.xml": strToU8(
          '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Oprema" r:id="rId1"/></sheets></workbook>',
        ),
        "xl/_rels/workbook.xml.rels": strToU8(
          '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        "xl/worksheets/sheet1.xml": strToU8(sheet(formula)),
      }),
    );
  try {
    await login(page);
    await page.goto("/imports");
    await page.getByLabel("CSV ili XLSX fajl").setInputFiles({
      name: "formule.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes(true),
    });
    await page.getByRole("button", { name: "Učitaj za pregled" }).click();
    await expect(page.locator("form [role=alert]")).toContainText(
      "Formule nisu dozvoljene",
    );
    await page.getByLabel("CSV ili XLSX fajl").setInputFiles({
      name: "fiktivno.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes(),
    });
    await page.getByRole("button", { name: "Učitaj za pregled" }).click();
    await expect(page).toHaveURL(/\/imports\/[a-f0-9-]+$/);
    batch = page.url().split("/").at(-1)!;
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(page.getByRole("article", { name: "Red 2" })).toContainText(
      "Novi sistem",
    );
    await page.screenshot({
      path: info.outputPath("xlsx-preview.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    if (batch) {
      await fixture.db.query(
        "delete from hvac_private.import_previews where organization_id=$1 and batch_id=$2",
        [fixture.org, batch],
      );
      await fixture.db.query(
        "delete from hvac_private.import_batches where organization_id=$1 and id=$2",
        [fixture.org, batch],
      );
    }
    await fixture.dispose();
  }
});
