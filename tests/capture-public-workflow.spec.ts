// Explicit publication tooling; skipped by ordinary test runs.
import { test, expect, type Locator, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";
import { createVerificationFixture } from "./auth-fixtures";
import { publicReport } from "../scripts/fixtures/public-report";

test.skip(process.env.CAPTURE_PUBLIC_WORKFLOW !== "true", "Explicit fictional publication capture only.");

test("capture the same isolated fictional visit through schedule, field and office", async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const owner = await createVerificationFixture();
  const technician = await createVerificationFixture().catch(async error => {
    await owner.dispose();
    throw error;
  });
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 });
  const fieldContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 1000 }, deviceScaleFactor: 2 });
  const office = await context.newPage();
  const field = await fieldContext.newPage();
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  const assets: Record<string, { src: string; width: number; height: number; sha256: string }> = {};
  async function capture(name: string, page: Page, elements: Locator[]) {
    for (const element of elements) await expect(element).toBeVisible();
    const boxes = await Promise.all(elements.map(element => element.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + scrollX, y: rect.y + scrollY, right: rect.right + scrollX, bottom: rect.bottom + scrollY };
    })));
    const clip = { x: Math.min(...boxes.map(box => box.x)), y: Math.min(...boxes.map(box => box.y)), width: 0, height: 0 };
    clip.width = Math.max(...boxes.map(box => box.right)) - clip.x;
    clip.height = Math.max(...boxes.map(box => box.bottom)) - clip.y;
    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", style: "nextjs-portal { visibility: hidden !important; }" });
    const left = Math.floor(clip.x * 2), top = Math.floor(clip.y * 2);
    const crop = { left, top, width: Math.ceil((clip.x + clip.width) * 2) - left, height: Math.ceil((clip.y + clip.height) * 2) - top };
    const { data, info } = await sharp(screenshot).extract(crop).resize({ width: name.endsWith("mobile") || name === "field" ? 780 : 1200 }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    await writeFile(`public/primeri/workflow-${name}.webp`, data);
    assets[name] = { src: `/primeri/workflow-${name}.webp`, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
  }
  async function rpc(actor: string, name: "save_operation" | "visit_bundle" | "visit_command", values: unknown[]) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      const result = await db.query(`select public.${name}(${values.map((_, index) => `$${index + 1}`).join(",")}) as result`, values);
      await db.query("commit");
      return result.rows[0].result;
    } catch (error) { await db.query("rollback"); throw error; }
  }
  try {
    await db.connect();
    await mkdir("public/primeri", { recursive: true });
    await office.goto(`/auth/confirm?token_hash=${owner.tokenHash}&type=signup`);
    await expect(office).toHaveURL(/\/account$/);
    await office.goto("/onboarding");
    await office.getByLabel("Naziv firme").fill("Sever servis · izmišljeni podaci");
    await office.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
    await expect(office).toHaveURL(/\/office$/);
    const org = (await db.query("select organization_id from public.memberships where user_id=$1 and role='owner'", [owner.id])).rows[0].organization_id as string;
    await office.goto("/settings/team");
    const invitation = office.locator("section").filter({ has: office.getByRole("heading", { name: "Pozovi novu osobu" }) });
    await invitation.getByLabel("Email nove osobe").fill(technician.email);
    await invitation.getByRole("button", { name: "Napravi poziv", exact: true }).click();
    const link = await invitation.getByLabel("Link poziva").inputValue();
    await field.goto(`/auth/confirm?token_hash=${technician.tokenHash}&type=signup`);
    await expect(field).toHaveURL(/\/account$/);
    await field.goto(link);
    await field.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(field).toHaveURL(/\/today$/);
    const member = (await db.query("select id from public.memberships where organization_id=$1 and user_id=$2 and active", [org, technician.id])).rows[0].id as string;
    const customer = randomUUID(), site = randomUUID(), visit = randomUUID();
    const systems = publicReport.items.map(() => randomUUID());
    const create = (id: string, kind: string, data: unknown) => rpc(owner.id, "save_operation", [org, id, kind, JSON.stringify(data)]);
    await create(customer, "customer", { name: publicReport.customer, contact: "" });
    await create(site, "site", { customerId: customer, code: "JA-02", name: publicReport.site, address: publicReport.address, timeZone: publicReport.timeZone, accessNote: "" });
    for (const [index, item] of publicReport.items.entries())
      await create(systems[index], "system", { siteId: site, code: item.code, room: item.room, model: item.model, serial: item.serial });
    await create(visit, "visit", { siteId: site, visitType: "maintenance", start: "2026-11-12T09:00", end: "2026-11-12T12:00", systems, members: [member] });

    await office.goto(`/schedule?date=2026-11-12&site=${site}`);
    const scheduled = office.getByRole("article").filter({ has: office.getByRole("heading", { name: publicReport.site, exact: true }) });
    await expect(scheduled).toContainText("4 sistema");
    await expect(scheduled).toContainText("Zakazano");
    await expect(scheduled).not.toContainText("@");
    await capture("schedule-desktop", office, [scheduled]);
    await office.setViewportSize({ width: 390, height: 1000 });
    await capture("schedule-mobile", office, [scheduled]);

    await field.goto(`/visits/${visit}`);
    const form = field.getByRole("form", { name: "Unos KL-03", exact: true });
    await form.getByLabel("Ishod", { exact: true }).selectOption("repair_needed");
    await form.getByLabel("Obavljeni radovi").fill(publicReport.items[2].work);
    await form.getByLabel("Nalaz za klijenta").fill(publicReport.items[2].finding);
    await capture("field", field, [form.getByRole("heading"), form.getByLabel("Nalaz za klijenta")]);

    const bundle = await rpc(technician.id, "visit_bundle", [org, visit]);
    for (const item of bundle.items) {
      const source = publicReport.items.find(source => source.code === item.code)!;
      await rpc(technician.id, "visit_command", [org, visit, randomUUID(), "save", item.version, JSON.stringify({
        itemId: item.id, outcome: source.outcome, work: source.work, finding: source.finding,
        noAccessReason: source.noAccessReason, internalNote: "", readings: [], parts: [],
        followUp: source.followUp ? { kind: source.followUp.kind, ownerId: member, dueDate: source.followUp.dueDate, customerAction: source.followUp.customerAction } : null,
      })]);
    }
    const saved = await rpc(technician.id, "visit_bundle", [org, visit]);
    await rpc(technician.id, "visit_command", [org, visit, randomUUID(), "submit", saved.version, "{}"]);
    await office.setViewportSize({ width: 1100, height: 1000 });
    await office.goto(`/visits/${visit}/preview`);
    const report = office.getByRole("article", { name: "Nacrt servisnog izveštaja" });
    await expect(report.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(report).toContainText("Prostorija je zaključana");
    const table = report.getByRole("region", { name: "Pregled sistema · pomeranje tabele" });
    await expect(table).not.toContainText("@");
    await capture("office-desktop", office, [report.locator("dl[aria-label='Pregled rezultata']"), table]);
    await office.setViewportSize({ width: 390, height: 1000 });
    // A static phone illustration cannot be scrolled: show the complete totals instead of clipping columns.
    await capture("office-mobile", office, [report.locator("dl[aria-label='Pregled rezultata']")]);
    await writeFile("public/primeri/workflow.json", JSON.stringify({
      fictional: true, scenario: publicReport.reference, site: "JA-02", date: "2026-11-12",
      totals: publicReport.totals, assets,
      example: publicReport.items.filter(item => item.followUp).map(item => ({
        code: item.code, room: item.room, finding: item.finding || item.noAccessReason,
        nextAction: item.followUp!.customerAction,
      })),
    }, null, 2) + "\n");
  } finally {
    await Promise.allSettled([context.close(), fieldContext.close(), db.end()]);
    try { await owner.dispose(); } finally { await technician.dispose(); }
  }
});
