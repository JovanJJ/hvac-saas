import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";

async function readyGuest() {
  const fixture = await createReportFixture();
  const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const worker = await workerClient();
  async function dispose() {
    await owner.auth.signOut({ scope: "local" });
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
  try {
    expect((await owner.auth.signInWithPassword({ email: "owner.a@hvac.example.invalid", password: process.env.SEED_PASSWORD! })).error).toBeNull();
    const issued = await owner.rpc("issue_report", { p_organization_id: fixture.org, p_visit_id: fixture.visitId, p_operation_id: randomUUID(), p_version: fixture.version });
    expect(issued.error).toBeNull();
    await processJob(worker, (await claimJob(worker, issued.data))!);
    const token = randomBytes(32).toString("base64url");
    const link = await owner.rpc("create_report_link", { p_organization_id: fixture.org, p_revision_id: issued.data, p_operation_id: randomUUID(), p_token_hash: createHash("sha256").update(token).digest("hex"), p_ttl_days: 7 });
    expect(link.error).toBeNull();
    return { ...fixture, token, revisionId: issued.data as string, dispose };
  } catch (error) { await dispose(); throw error; }
}

test("customer reads responsive revision and confirms explicitly with retained inputs after a lost response", async ({ page }, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const fixture = await readyGuest();
  let release = () => {};
  try {
    await page.goto(`/r/${fixture.token}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Servisni izveštaj");
    await expect(page.locator(".guest-heading")).toContainText(fixture.siteName);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    const article = page.getByRole("article", { name: "Izdat servisni izveštaj" });
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(article.getByRole("definition")).toHaveText(["4", "3", "2"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 360) {
        const table = page.getByRole("region", { name: "Pregled sistema · pomeranje tabele" });
        await table.focus();
        await table.press("ArrowRight");
        await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      }
      await page.screenshot({ path: info.outputPath(`customer-report-${width}.png`), fullPage: true });
    }
    const count = async () => (await fixture.db.query("select count(*)::int n from hvac_private.report_receipts where revision_id=$1", [fixture.revisionId])).rows[0].n;
    const download = await page.request.get(`/r/${fixture.token}/pdf`);
    expect(download.status()).toBe(200);
    expect(await count()).toBe(0);
    const receipt = page.getByRole("region", { name: "Potvrda prijema", exact: true });
    const shortcut = page.getByRole("link", { name: "Potvrda prijema (opciono)", exact: true });
    await shortcut.focus();
    await shortcut.press("Enter");
    await expect(page).toHaveURL(/#guest-receipt$/);
    await expect(receipt.getByRole("checkbox")).not.toBeChecked();
    const name = receipt.getByLabel("Ime i prezime", { exact: true });
    const role = receipt.getByLabel("Uloga kod klijenta", { exact: true });
    await name.fill("   ");
    await role.fill("Upravnik");
    await receipt.getByRole("checkbox").check();
    await receipt.getByRole("button", { name: "Potvrdi prijem izveštaja", exact: true }).click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
    expect(await count()).toBe(0);
    await name.fill("Fiktivna Mila Đurić");
    let drop = true;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/r/*/receipt", async route => {
      const result = await route.fetch();
      if (drop) { drop = false; await gate; await route.abort("failed"); }
      else await route.fulfill({ response: result });
    });
    await receipt.getByRole("button", { name: "Potvrdi prijem izveštaja", exact: true }).click();
    await expect(name).toBeDisabled();
    await expect(role).toBeDisabled();
    await expect.poll(count).toBe(1);
    release();
    await expect(receipt.getByRole("alert")).toContainText("Odgovor nije primljen");
    await expect(name).toHaveValue("Fiktivna Mila Đurić");
    await expect(role).toHaveValue("Upravnik");
    await expect(receipt.getByRole("checkbox")).toBeChecked();
    await receipt.getByRole("button", { name: "Potvrdi prijem izveštaja", exact: true }).click();
    await expect(receipt.getByRole("status")).toContainText("Prijem je potvrđen.");
    await expect(receipt.getByLabel("Zabeležena potvrda prijema", { exact: true })).toBeFocused();
    expect(await count()).toBe(1);
    await page.reload();
    await expect(receipt.getByRole("status")).toContainText("Fiktivna Mila Đurić");
    await expect(receipt.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pogledaj potvrdu prijema" })).toBeVisible();
    expect(await count()).toBe(1);
    await receipt.screenshot({ path: info.outputPath("customer-receipt-confirmed.png") });
    await expect(article).not.toContainText("SECRET");
  } finally { release(); await fixture.dispose(); }
});

test("temporary guest read failure offers retry without showing an invalid-link or a receipt form", async ({ page, request }) => {
  test.setTimeout(60000);
  const proxy = process.env.TEST_STAFF_FAILURE_PROXY_URL;
  test.skip(!proxy, "Requires the controlled loopback RPC failure proxy");
  const fixture = await readyGuest();
  try {
    await request.get(`${proxy}/__test/fail`);
    const response = await page.goto(`/r/${fixture.token}`);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Izveštaj trenutno nije dostupan");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Potvrda prijema", exact: true })).toHaveCount(0);
    await request.get(`${proxy}/__test/recover`);
    await page.getByRole("button", { name: "Pokušaj ponovo", exact: true }).click();
    await expect(page.getByRole("article", { name: "Izdat servisni izveštaj" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/r/${fixture.token}`);
  } finally {
    await request.get(`${proxy}/__test/recover`);
    await fixture.dispose();
  }
});
