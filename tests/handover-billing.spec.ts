import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
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
  await expect(page).toHaveURL(/\/(office|today)$/);
}
test("office keeps receipt and billing preparation independent, audits clear/recheck and protects stale editors and issued PDF", async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture();
  const owner = await api();
  const worker = await workerClient();
  const scoped = { p_organization_id: fixture.org };
  const guestContext = await browser.newContext({ viewport: info.project.use.viewport });
  try {
    const issue = await owner.rpc("issue_report", { ...scoped, p_visit_id: fixture.visitId, p_operation_id: randomUUID(), p_version: fixture.version });
    expect(issue.error).toBeNull();
    const r1 = issue.data;
    await processJob(worker, (await claimJob(worker, r1))!);
    const original = (await owner.rpc("report_revision", { ...scoped, p_revision_id: r1 })).data;
    const originalPdf = await owner.storage.from("report-pdfs").download(original.artifact.path);
    expect(originalPdf.error).toBeNull();
    const oldDigest = digest(Buffer.from(await originalPdf.data!.arrayBuffer()));
    const originalActions = (await fixture.db.query("select f.* from public.follow_ups f join public.visit_items i on i.id=f.item_id where i.visit_id=$1 order by f.id", [fixture.visitId])).rows;
    const token = randomBytes(32).toString("base64url");
    expect((await owner.rpc("create_report_link", { ...scoped, p_revision_id: r1, p_operation_id: randomUUID(), p_token_hash: digest(token), p_ttl_days: 7 })).error).toBeNull();
    await login(page);
    await page.goto(`/office/handover?site=${fixture.siteId}`);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Bez potvrde prijema");
    const filters = page.getByRole("form", { name: "Filteri primopredaje" });
    await filters.getByLabel("Klijent", { exact: true }).selectOption(fixture.customerId);
    await filters.getByLabel("Revizije", { exact: true }).selectOption("latest");
    await filters.getByRole("button", { name: "Prikaži primopredaju" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("site")).toBe(fixture.siteId);
    await page.screenshot({ path: info.outputPath("missing-receipt.png"), fullPage: true });
    await page.goto(`/office/handover/${fixture.visitId}`);
    await expect(page.getByText("Oznaka: Nije označeno kao spremno", { exact: true })).toBeVisible();
    const stale = await page.context().newPage();
    stale.setDefaultTimeout(10000);
    await stale.goto(`/office/handover/${fixture.visitId}`);
    await expect(stale.getByLabel("Interna beleška o proveri")).toBeVisible();
    await page.getByRole("button", { name: "Označi spremno za proveru naplate", exact: true }).click();
    expect((await owner.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).data.history).toHaveLength(0);
    await page.getByLabel("Interna beleška o proveri").fill("Fiktivna kancelarijska provera M5h");
    await page.getByRole("button", { name: "Označi spremno za proveru naplate", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Označeno kao spremno");
    await stale.getByLabel("Interna beleška o proveri").fill("Fiktivan zastareli prozor");
    await stale.getByRole("button", { name: "Označi spremno za proveru naplate", exact: true }).click();
    await expect(stale.getByRole("form", { name: "Oznaka za proveru naplate" }).getByRole("alert")).toContainText("Poseta ili oznaka su promenjeni");
    await expect(stale.getByLabel("Interna beleška o proveri")).toHaveValue("Fiktivan zastareli prozor");
    await stale.close();
    const billingBefore = (await owner.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).data.billing;
    const guest = await guestContext.newPage();
    guest.setDefaultTimeout(10000);
    await guest.goto(`/r/${token}`);
    await guest.getByLabel("Ime i prezime").fill("Fiktivni primalac");
    await guest.getByLabel("Uloga kod klijenta").fill("Upravnik");
    await guest.getByRole("checkbox").check();
    await guest.getByRole("button", { name: "Potvrdi prijem izveštaja", exact: true }).click();
    await expect(guest.getByText("Potvrdio/la: Fiktivni primalac · Upravnik", { exact: true })).toBeVisible();
    expect((await owner.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).data.billing).toEqual(billingBefore);
    await page.goto(`/office/handover?site=${fixture.siteId}`);
    await expect(page.getByText("Nema stavki za izabrane filtere.")).toBeVisible();
    await page.goto(`/office/handover?site=${fixture.siteId}&state=received`);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Prijem potvrđen");
    await page.goto(`/office/handover?queue=billing&state=ready&site=${fixture.siteId}`);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Fiktivna kancelarijska provera M5h");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("billing-ready.png"), fullPage: true });
    await page.getByRole("link", { name: "Proveri pripremu naplate" }).click();
    await page.getByLabel("Interna beleška o proveri").fill("Fiktivno uklanjanje oznake");
    await page.getByRole("button", { name: "Ukloni oznaku spremnosti", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Oznaka spremnosti je uklonjena");
    const cleared = (await owner.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).data;
    expect(cleared.billing.ready).toBe(false); expect(cleared.history).toHaveLength(2);
    const ready = await owner.rpc("billing_review_command", { ...scoped, p_visit_id: fixture.visitId, p_operation_id: randomUUID(), p_version: cleared.billing.version, p_visit_version: cleared.visitVersion, p_ready: true, p_note: "Fiktivna ponovna priprema" });
    expect(ready.error).toBeNull();
    const amendment = (await owner.rpc("report_amendment", { ...scoped, p_revision_id: r1 })).data;
    amendment.items[0].finding = "Fiktivna dopuna nakon oznake";
    const amended = await owner.rpc("amend_report", { ...scoped, p_base_revision_id: r1, p_operation_id: randomUUID(), p_version: amendment.visitVersion, p_reason: "Fiktivna dopuna M5h", p_items: amendment.items });
    expect(amended.error).toBeNull();
    await page.goto(`/office/handover?queue=billing&site=${fixture.siteId}`);
    await expect(page.getByRole("article")).toContainText("Potrebna ponovna provera");
    await page.goto(`/office/handover?site=${fixture.siteId}`);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Revizija 2");
    await expect(page.getByRole("article").getByRole("link", { name: "Otvori izveštaj i potvrde" })).toHaveAttribute("href", `/office/reports/${amended.data}`);
    const oldAgain = (await owner.rpc("report_revision", { ...scoped, p_revision_id: r1 })).data;
    expect(oldAgain.data).toEqual(original.data);
    const pdfAgain = await owner.storage.from("report-pdfs").download(original.artifact.path);
    expect(digest(Buffer.from(await pdfAgain.data!.arrayBuffer()))).toBe(oldDigest);
    expect((await fixture.db.query("select f.* from public.follow_ups f join public.visit_items i on i.id=f.item_id where i.visit_id=$1 order by f.id", [fixture.visitId])).rows).toEqual(originalActions);
    await page.goto(`/office/handover/${fixture.visitId}`);
    await expect(page.getByText("Podaci posete su promenjeni nakon označavanja. Potrebna je ponovna provera.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("billing-audit-recheck.png"), fullPage: true });
  } finally {
    await guestContext.close(); await owner.auth.signOut({ scope: "local" }); worker.auth.stopAutoRefresh(); await worker.auth.signOut({ scope: "local" }); await fixture.dispose();
  }
});

test("guest receipt cannot set readiness and other organizations and field accounts cannot read or change billing", async ({ page }, info) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture();
  const owner = await api(); const worker = await workerClient();
  const scoped = { p_organization_id: fixture.org };
  try {
    const issue = await owner.rpc("issue_report", { ...scoped, p_visit_id: fixture.visitId, p_operation_id: randomUUID(), p_version: fixture.version });
    expect(issue.error).toBeNull();
    await processJob(worker, (await claimJob(worker, issue.data))!);
    const token = randomBytes(32).toString("base64url");
    expect((await owner.rpc("create_report_link", { ...scoped, p_revision_id: issue.data, p_operation_id: randomUUID(), p_token_hash: digest(token), p_ttl_days: 7 })).error).toBeNull();
    const guest = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await guest.rpc("acknowledge_report", { p_token: token, p_name: "Fiktivni primalac", p_role: "Upravnik", p_acknowledged: true })).error).toBeNull();
    const detail = (await owner.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).data;
    expect(detail.billing.ready).toBe(false); expect(detail.billing.version).toBe(0); expect(detail.history).toHaveLength(0);
    for (const client of [guest, await api("owner.b@hvac.example.invalid"), await api("technician.a@hvac.example.invalid"), await api("unassigned@hvac.example.invalid")]) {
      expect((await client.rpc("handover_queue", { ...scoped, p_filters: {} })).error).not.toBeNull();
      expect((await client.rpc("billing_review_detail", { ...scoped, p_visit_id: fixture.visitId })).error).not.toBeNull();
      expect((await client.rpc("billing_review_command", { ...scoped, p_visit_id: fixture.visitId, p_operation_id: randomUUID(), p_version: 0, p_visit_version: detail.visitVersion, p_ready: true, p_note: "Denied" })).error).not.toBeNull();
      await client.auth.signOut({ scope: "local" });
    }
    await login(page, "technician.a@hvac.example.invalid");
    await page.goto(`/office/handover/${fixture.visitId}`);
    await expect(page.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("billing-denied.png"), fullPage: true });
  } finally { await owner.auth.signOut({ scope: "local" }); worker.auth.stopAutoRefresh(); await worker.auth.signOut({ scope: "local" }); await fixture.dispose(); }
});
