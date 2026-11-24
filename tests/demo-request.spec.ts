import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

async function database() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  return db;
}

test("demo validation, pending, durable receipt, exact replay and protected operator retrieval", async ({ page }, testInfo) => {
  const email = `demo-${randomUUID()}@hvac.example.invalid`;
  const db = await database();
  try {
    await page.goto("/demo?plan=tim");
    await expect(page.getByLabel("Plan koji vas zanima (opciono)")).toHaveValue("tim");
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(page.getByText("Unesite ime.", { exact: true })).toBeVisible();
    await expect(page.getByText("Unesite ispravnu imejl adresu.", { exact: true })).toBeVisible();
    await page.getByLabel("Ime", { exact: true }).fill("Fictional operator");
    await page.getByLabel("Imejl za dogovor").fill("bad-email");
    await page.getByLabel("Naziv servisa").fill("Fictional service");
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(page.getByText("Unesite ispravnu imejl adresu.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Naziv servisa")).toHaveValue("Fictional service");
    await page.getByLabel("Imejl za dogovor").fill(email);
    await page.getByLabel("Plan koji vas zanima (opciono)").selectOption("solo");
    const id = await page.locator('input[name="operationId"]').inputValue();
    // Hold the request until the disabled/pending state is observed, then release it.
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/demo?plan=tim", async route => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    const requestPromise = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    const original = await requestPromise;
    await expect(page.getByRole("button", { name: "Slanje…" })).toBeDisabled();
    await expect(page.getByLabel("Imejl za dogovor")).toBeDisabled();
    release();
    await expect(page.getByText(/^Zahtev je primljen\./)).toBeVisible();
    await page.unroute("**/demo?plan=tim");
    const headers = { ...original.headers() };
    delete headers["content-length"];
    // Real concurrent HTTP replays, including a lost-response retry, use the same operation.
    const replays = await Promise.all([1, 2].map(() => page.request.post(original.url(), { headers, data: original.postDataBuffer()! })));
    for (const response of replays) expect(response.ok()).toBe(true);
    const result = await db.query("select operation_id,plan from hvac_private.demo_requests where email=$1", [email]);
    expect(result.rows).toEqual([{ operation_id: id, plan: "solo" }]);
    // This is the exact operator destination, not a test-only retrieval endpoint.
    const lead = JSON.parse(execFileSync(process.execPath, ["scripts/demo-leads.mjs", id], { encoding: "utf8" }));
    expect(lead).toHaveLength(1);
    expect(lead[0].email).toBe(email);
    expect(lead[0].company).toBe("Fictional service");
    await page.screenshot({ path: testInfo.outputPath("demo-success.png"), fullPage: true });
  } finally { await db.query("delete from hvac_private.demo_requests where email=$1", [email]); await db.end(); }
});

test("demo keeps fields after network failure and enforces per-email quota", async ({ page }) => {
  const email = `demo-${randomUUID()}@hvac.example.invalid`;
  const db = await database();
  try {
    await page.goto("/demo");
    await page.getByLabel("Ime", { exact: true }).fill("Fictional operator");
    await page.getByLabel("Imejl za dogovor").fill(email);
    await page.getByLabel("Naziv servisa").fill("Fictional service");
    const id = await page.locator('input[name="operationId"]').inputValue();
    await page.route("**/demo", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Zahtev nije poslat." })).toBeVisible();
    await expect(page.getByLabel("Imejl za dogovor")).toHaveValue(email);
    await expect(page.locator('input[name="operationId"]')).toHaveValue(id);
    await page.unroute("**/demo");
    for (let i = 0; i < 3; i++) await db.query("select public.submit_demo_request($1,'Fictional operator',$2,'Fictional service','')", [randomUUID(),email]);
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Previše zahteva." })).toBeVisible();
    await expect(page.getByLabel("Ime", { exact: true })).toHaveValue("Fictional operator");
    await expect(page.getByText(/^Zahtev je primljen\./)).toHaveCount(0);
    // An existing operation with different content is an actual database error.
    await db.query("delete from hvac_private.demo_requests where email=$1", [email]);
    await db.query("select public.submit_demo_request($1,'Different operator',$2,'Different service','')", [id,email]);
    await page.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Zahtev nije poslat." })).toBeVisible();
  } finally { await db.query("delete from hvac_private.demo_requests where email=$1", [email]); await db.end(); }
});

test("demo phone/desktop layout, keyboard and report link", async ({ page }, testInfo) => {
  await page.goto("/demo?plan=solo");
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const form = (await page.locator("form").boundingBox())!;
    const agenda = (await page.getByRole("complementary").boundingBox())!;
    if (width < 1024) expect(agenda.y).toBeGreaterThan(form.y + form.height);
    else expect(agenda.x).toBeGreaterThan(form.x + form.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`demo-${width}.png`), fullPage: true });
  }
  await page.getByLabel("Naziv servisa").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Plan koji vas zanima (opciono)")).toBeFocused();
  await page.keyboard.press("Tab");
  const privacy = page.getByRole("link", { name: "Kako koristimo podatke" });
  if (await privacy.count()) {
    await expect(privacy).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "Pošalji zahtev" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Otvori primer PDF-a" })).toHaveAttribute("href", "/primeri/servisni-izvestaj.pdf");
});
