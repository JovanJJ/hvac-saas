import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createReportFixture } from "./report-fixture";
import { parseImport } from "../features/imports/parser";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function api(email = "owner.a@hvac.example.invalid") {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword({ email, password: process.env.SEED_PASSWORD! })).error).toBeNull();
  return client;
}
async function login(page: Page, email = "owner.a@hvac.example.invalid") {
  page.setDefaultTimeout(10000);
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today|onboarding)$/);
}
function records(bytes: Uint8Array) {
  const grid = parseImport("export.csv", bytes);
  return grid.rows.map(r => Object.fromEntries(grid.headers.map((key, index) => [key, r.cells[index]])));
}
test("owner downloads joinable CSV archive with same-label systems, safe Serbian cells, scoped empty CSV and unchanged issued PDF", async ({ page }, info) => {
  test.setTimeout(120000);
  const first = await createReportFixture({ systemCount: 1 });
  const second = await createReportFixture({ systemCount: 1 });
  const owner = await api(); const worker = await workerClient();
  const empty = randomUUID(), oldUnit = randomUUID(), newUnit = randomUUID();
  try {
    await first.db.query("update public.systems set serial='000123' where id=$1", [first.systemIds[0]]);
    await first.db.query("update public.visit_items set work=$1 where visit_id=$2", ['Čišćenje; "filter"\nNovi red', first.visitId]);
    await first.db.query("update public.sites set access_note=$1 where id=$2", [" \t=SUM(1;2)", first.siteId]);
    await first.db.query("insert into public.units(id,organization_id,system_id,role,serial,updated_by) values($1,$2,$3,'indoor','00100','a1000000-0000-4000-8000-000000000101')", [oldUnit, first.org, first.systemIds[0]]);
    await first.db.query("insert into public.units(id,organization_id,system_id,role,serial,updated_by,replaces_id) values($1,$2,$3,'indoor','00200','a1000000-0000-4000-8000-000000000101',$4)", [newUnit, first.org, first.systemIds[0], oldUnit]);
    await first.db.query("update public.units set archived_at=now() where id=$1", [oldUnit]);
    await first.db.query("insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values($1,$2,$3,($1::uuid)::text,'Fiktivno prazna CSV lokacija','Primer','Europe/Belgrade')", [empty, first.org, first.customerId]);
    const issue = await owner.rpc("issue_report", { p_organization_id: first.org, p_visit_id: first.visitId, p_operation_id: randomUUID(), p_version: first.version });
    expect(issue.error).toBeNull();
    await processJob(worker, (await claimJob(worker, issue.data))!);
    const frozen = (await owner.rpc("report_revision", { p_organization_id: first.org, p_revision_id: issue.data })).data;
    const pdf = await owner.storage.from("report-pdfs").download(frozen.artifact.path);
    const checksum = hash(Buffer.from(await pdf.data!.arrayBuffer()));
    await first.db.query("update public.systems set archived_at=now() where id=$1", [first.systemIds[0]]);
    const source = (await first.db.query("select to_jsonb(i) as data from public.visit_items i where visit_id=$1 order by id", [first.visitId])).rows;
    await login(page);
    await page.getByRole("link", { name: "Izvoz podataka", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Izvoz podataka");
    await expect(page.getByText("Obuhvat: Cela organizacija", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Preuzmi izvoz", exact: true }).click();
    const archive = await download;
    expect(archive.suggestedFilename()).toMatch(/\.zip$/);
    await archive.saveAs(info.outputPath("owner-export.zip"));
    const files = unzipSync(await readFile(info.outputPath("owner-export.zip")));
    expect(Object.keys(files).sort()).toEqual(["customers.csv", "manifest.json", "sites.csv", "systems.csv", "units.csv", "visit_items.csv", "visits.csv"]);
    const systems = records(files["systems.csv"]), visits = records(files["visits.csv"]), items = records(files["visit_items.csv"]), units = records(files["units.csv"]);
    const a = systems.find(s => s["ID sistema"] === first.systemIds[0])!;
    const b = systems.find(s => s["ID sistema"] === second.systemIds[0])!;
    expect(a["Oznaka sistema"]).toBe(b["Oznaka sistema"]);
    expect(a["ID lokacije"]).toBe(first.siteId); expect(b["ID lokacije"]).toBe(second.siteId);
    expect(a["Serijski broj"]).toBe("000123"); expect(a["Arhivirano"]).not.toBe("");
    const linked = items.find(i => i["ID posete"] === first.visitId)!;
    expect(linked["ID sistema"]).toBe(a["ID sistema"]);
    expect(linked["Radovi"]).toBe('Čišćenje; "filter"\nNovi red');
    expect(linked["ID autora nalaza"]).toBe("a1000000-0000-4000-8000-000000000102");
    expect(visits.find(v => v["ID posete"] === first.visitId)!["ID lokacije"]).toBe(first.siteId);
    expect(units.find(u => u["ID komponente"] === newUnit)!["ID prethodne komponente"]).toBe(oldUnit);
    expect(records(files["sites.csv"]).find(s => s["ID lokacije"] === first.siteId)!["Interne napomene za pristup"]).toBe("\t \t=SUM(1;2)");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.organizationId).toBe(first.org); expect(manifest.scope).toBe("organization");
    expect(manifest.files.find((f: { name: string }) => f.name === "systems.csv").rows).toBe(systems.length);
    for (const content of Object.values(files)) expect(strFromU8(content)).not.toMatch(/token_hash|storage_path|REPORT_WORKER_PASSWORD|cloudinary|lease_token/);
    await page.goto(`/settings/exports?site=${first.siteId}`);
    const scopedResponse = await page.request.get(`/api/office/exports?dataset=systems&dataset=visits&dataset=visit_items&site=${first.siteId}`);
    expect(scopedResponse.status()).toBe(200);
    expect(scopedResponse.headers()["cache-control"]).toContain("no-store");
    const scoped = unzipSync(await scopedResponse.body());
    expect(records(scoped["systems.csv"])).toHaveLength(1);
    expect(records(scoped["visits.csv"])).toHaveLength(1);
    expect(JSON.parse(strFromU8(scoped["manifest.json"])).siteId).toBe(first.siteId);
    expect(strFromU8(scoped["systems.csv"])).not.toContain(second.systemIds[0]);
    await expect(page.getByRole("form", { name: "Preuzimanje izvoza" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("owner-export-scope.png"), fullPage: true });
    await page.getByLabel("Lokacija za izvoz").selectOption(empty);
    await page.getByRole("button", { name: "Prikaži obuhvat", exact: true }).click();
    const choices = page.getByRole("form", { name: "Preuzimanje izvoza" });
    await expect(page.getByText(`Obuhvat: ${empty} · Fiktivno prazna CSV lokacija`, { exact: true })).toBeVisible();
    await expect(choices.getByRole("checkbox")).toHaveCount(6);
    for (const checkbox of await choices.getByRole("checkbox").all()) await checkbox.uncheck();
    await page.getByRole("button", { name: "Preuzmi izvoz", exact: true }).click();
    await expect(choices.getByRole("status")).toHaveText("Izaberite najmanje jedan skup podataka.");
    await choices.getByLabel("Sistemi · 0 zapisa", { exact: true }).check();
    const singleDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Preuzmi izvoz", exact: true }).click();
    const single = await singleDownload;
    expect(single.suggestedFilename()).toMatch(/\.csv$/);
    await single.saveAs(info.outputPath("empty-systems.csv"));
    const emptyBytes = await readFile(info.outputPath("empty-systems.csv"));
    expect([...emptyBytes.slice(0, 3)]).toEqual([239, 187, 191]);
    expect(strFromU8(emptyBytes).split("\r\n")).toHaveLength(2);
    expect((await first.db.query("select to_jsonb(i) as data from public.visit_items i where visit_id=$1 order by id", [first.visitId])).rows).toEqual(source);
    expect((await owner.rpc("report_revision", { p_organization_id: first.org, p_revision_id: issue.data })).data.data).toEqual(frozen.data);
    const pdfAgain = await owner.storage.from("report-pdfs").download(frozen.artifact.path);
    expect(hash(Buffer.from(await pdfAgain.data!.arrayBuffer()))).toBe(checksum);
  } finally {
    await owner.auth.signOut({ scope: "local" }); worker.auth.stopAutoRefresh(); await worker.auth.signOut({ scope: "local" });
    await first.db.query("delete from public.units where id=any($1::uuid[])", [[newUnit, oldUnit]]);
    await first.db.query("delete from public.sites where id=$1", [empty]);
    await second.dispose(); await first.dispose();
  }
});

test("export route denies coordinator, field, anonymous, revoked and cross-tenant access and explains oversized scope", async ({ page, browser }, info) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture({ systemCount: 1 });
  const org = randomUUID(), site = randomUUID(), customer = randomUUID();
  const owner = await api(), coordinator = await api("owner.b@hvac.example.invalid");
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";
  const contexts = [];
  try {
    await fixture.db.query("insert into public.organizations(id,display_name) values($1,'Fiktivni izolovani CSV izvoz')", [org]);
    await fixture.db.query("insert into public.memberships(organization_id,user_id,role) values($1,'a1000000-0000-4000-8000-000000000101','owner'),($1,'a1000000-0000-4000-8000-000000000103','coordinator')", [org]);
    expect((await coordinator.rpc("owner_export", { p_organization_id: org, p_datasets: ["customers"] })).error).not.toBeNull();
    expect((await coordinator.rpc("owner_export", { p_organization_id: fixture.org, p_datasets: ["customers"] })).error).not.toBeNull();
    for (const email of ["technician.a@hvac.example.invalid", "unassigned@hvac.example.invalid", "owner.b@hvac.example.invalid"]) {
      const context = await browser.newContext({ viewport: info.project.use.viewport }); contexts.push(context);
      const denied = await context.newPage(); await login(denied, email);
      if (email === "owner.b@hvac.example.invalid") await context.addCookies([{ name: "teren_workspace_a1000000-0000-4000-8000-000000000103", value: org, url: origin }]);
      expect((await denied.request.get("/api/office/exports?dataset=customers")).status()).toBe(404);
      await denied.goto("/settings/exports");
      if (email === "unassigned@hvac.example.invalid") await expect(denied).toHaveURL(/\/onboarding$/);
      else await expect(denied.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    }
    const anonymous = await browser.newContext(); contexts.push(anonymous);
    expect((await anonymous.request.get(origin + "/api/office/exports?dataset=customers")).status()).toBe(401);
    await login(page);
    await page.context().addCookies([{ name: "teren_workspace_a1000000-0000-4000-8000-000000000101", value: org, url: origin }]);
    await page.goto("/settings/exports");
    const emptyResponse = await page.request.get("/api/office/exports?dataset=customers");
    expect(emptyResponse.status()).toBe(200);
    expect(strFromU8(await emptyResponse.body()).split("\r\n")).toHaveLength(2);
    expect((await page.request.get("/api/office/exports")).status()).toBe(422);
    expect((await page.request.get("/api/office/exports?dataset=sites&dataset=sites")).status()).toBe(422);
    expect((await page.request.get(`/api/office/exports?dataset=sites&site=${fixture.siteId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/office/exports?dataset=sites&organizationId=${fixture.org}`)).status()).toBe(422);
    await fixture.db.query("insert into public.customers(id,organization_id,name) values($1,$2,'Fiktivni veliki izvoz')", [customer, org]);
    await fixture.db.query("insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone,access_note) values($1,$2,$3,($1::uuid)::text,'Fiktivna velika lokacija','Primer','Europe/Belgrade',repeat('x',16777217))", [site, org, customer]);
    await page.goto(`/settings/exports?site=${site}`);
    const form = page.getByRole("form", { name: "Preuzimanje izvoza" });
    await expect(form.getByRole("checkbox")).toHaveCount(6);
    for (const checkbox of await form.getByRole("checkbox").all()) await checkbox.uncheck();
    await form.getByLabel("Lokacije · 1 zapisa", { exact: true }).check();
    await form.getByRole("button", { name: "Preuzmi izvoz", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("Izvoz je prevelik");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("export-limit.png"), fullPage: true });
    await fixture.db.query("update public.memberships set active=false where organization_id=$1 and user_id='a1000000-0000-4000-8000-000000000101'", [org]);
    expect((await page.request.get("/api/office/exports?dataset=customers")).status()).toBe(404);
    expect((await owner.rpc("owner_export", { p_organization_id: org, p_datasets: ["customers"] })).error).not.toBeNull();
  } finally {
    for (const context of contexts) await context.close();
    await owner.auth.signOut({ scope: "local" }); await coordinator.auth.signOut({ scope: "local" });
    await fixture.db.query("delete from public.sites where id=$1", [site]);
    await fixture.db.query("delete from public.customers where id=$1", [customer]);
    await fixture.db.query("delete from public.memberships where organization_id=$1", [org]);
    await fixture.db.query("delete from public.organizations where id=$1", [org]);
    await fixture.dispose();
  }
});
