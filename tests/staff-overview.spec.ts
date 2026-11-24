import { openWorkspaceControls } from "./staff-controls";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createVerificationFixture } from "./auth-fixtures";
import { createReportFixture } from "./report-fixture";
import { shiftDate } from "../features/scheduling/model";

async function confirm(page: Page, user: Awaited<ReturnType<typeof createVerificationFixture>>) {
  await page.goto(`/auth/confirm?token_hash=${user.tokenHash}&type=signup`);
  await expect(page).toHaveURL(/\/account$/);
}
async function createWorkspace(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Naziv firme").fill(name);
  await page.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
  await expect(page).toHaveURL(/\/office$/);
  return (await page.context().cookies()).find(cookie => cookie.name.startsWith("teren_workspace_"))!.value;
}
async function openMenu(page: Page) {
  const menu = page.locator("summary:visible").filter({ hasText: "Meni tima" });
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await expect(menu).toBeVisible();
    if (await menu.locator("..").getAttribute("open") === null) await menu.click();
  }
  const navigation = page.getByRole("navigation", { name: "Navigacija tima", exact: true });
  await expect(navigation).toBeVisible();
  return navigation;
}

// Own temporary organizations/users only. No shared seed records, mail or worker jobs are changed.
test("office overview, role navigation, workspace boundaries and schedule filters", async ({ page, browser }, testInfo) => {
  test.setTimeout(150000);
  const users = await Promise.all(Array.from({ length: 4 }, () => createVerificationFixture()));
  const [owner, coordinator, technician, unassigned] = users;
  const contexts = await Promise.all(users.slice(1).map(() => browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport })));
  const [coordinatorPage, technicianPage, unassignedPage] = await Promise.all(contexts.map(context => context.newPage()));
  for (const current of [page,coordinatorPage,technicianPage,unassignedPage]) current.setDefaultTimeout(10000);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const names = [`UX09 Prva ${randomUUID().slice(0, 8)}`, `UX09 Druga ${randomUUID().slice(0, 8)}`];
  let scheduled: Awaited<ReturnType<typeof createReportFixture>> | undefined;
  let submitted: Awaited<ReturnType<typeof createReportFixture>> | undefined;
  const planId = randomUUID(), jobId = randomUUID();
  let organization = "";
  try {
    await Promise.all([confirm(page, owner), confirm(coordinatorPage, coordinator), confirm(technicianPage, technician), confirm(unassignedPage, unassigned)]);
    organization = await createWorkspace(page, names[0]);
    await expect(page.getByRole("heading", { name: "Dodajte prvu lokaciju da biste zakazali posetu." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dodaj lokaciju", exact: true })).toHaveAttribute("href", "/sites");
    await expect(page.getByRole("heading", { name: "Čeka pregled · 0" })).toBeVisible();
    const memberIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, user] of [coordinator, technician, unassigned].entries()) {
      await db.query("insert into public.memberships(id,organization_id,user_id,role) values($1,$2,$3,$4)", [memberIds[index], organization, user.id, index === 0 ? "coordinator" : "technician"]);
    }
    await page.goto("/account");
    await page.getByRole("button", { name: "Novi radni prostor", exact: true }).click();
    await page.getByLabel("Naziv firme").fill(names[1]);
    await page.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    const other = (await page.context().cookies()).find(cookie => cookie.name === `teren_workspace_${owner.id}`)!.value;
    await db.query("insert into public.memberships(organization_id,user_id,role) values($1,$2,'technician')", [other,coordinator.id]);
    // Preserve the existing visible workspace picker and derive new role/content on selection.
    await openWorkspaceControls(page);
    await page.getByRole("combobox", { name: "Radni prostor", exact: true }).selectOption(organization);
    await page.getByRole("button", { name: "Otvori radni prostor", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await expect(page.getByRole("main").getByText(names[0], { exact: true })).toBeVisible();
    scheduled = await createReportFixture({ organizationId: organization, ownerId: owner.id, technicianId: technician.id, submitted: false });
    submitted = await createReportFixture({ organizationId: organization, ownerId: owner.id, technicianId: technician.id });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Belgrade" });
    const tomorrow = shiftDate(today, 1);
    await db.query("update public.visits set scheduled_at=($1||'T09:00')::timestamp at time zone 'Europe/Belgrade',ends_at=($1||'T12:00')::timestamp at time zone 'Europe/Belgrade' where id=$2", [shiftDate(today, -1), submitted.visitId]);
    await db.query("update public.visits set scheduled_at=($1||'T08:00')::timestamp at time zone 'Europe/Belgrade',ends_at=($1||'T09:00')::timestamp at time zone 'Europe/Belgrade' where id=$2", [today, scheduled.visitId]);
    // A disabled source and ready job exercise existing generated-visit links without running a worker.
    await db.query("insert into public.maintenance_plans(id,organization_id,site_id,name,anchor_date,anchor_time,time_zone,interval_months,duration_minutes,enabled,created_by,updated_by) values($1,$2,$3,'UX09 redovno održavanje',$4,'08:00','Europe/Belgrade',6,60,false,$5,$5)", [planId, organization, scheduled.siteId, today, owner.id]);
    await db.query("insert into hvac_private.maintenance_jobs(id,organization_id,plan_id,plan_version,from_date,until_date,requested_by,state) values($1,$2,$3,1,$4,$4,$5,'ready')", [jobId,organization,planId,today,owner.id]);
    await db.query("insert into public.maintenance_occurrences(organization_id,site_id,plan_id,intended_date,visit_id,plan_version,job_id,time_zone,intended_local,resolved_local,starts_at,ends_at) select organization_id,site_id,$1::uuid,$2::date,id,1,$3::uuid,'Europe/Belgrade',to_char($2::date,'YYYY-MM-DD')||'T08:00',to_char($2::date,'YYYY-MM-DD')||'T08:00',scheduled_at,ends_at from public.visits where id=$4", [planId,today,jobId,scheduled.visitId]);
    await page.goto("/office");
    await expect(page.getByRole("heading", { name: "Današnje posete · 1" })).toBeVisible();
    const todaySection = page.getByRole("region", { name: "Današnje posete · 1" });
    await expect(todaySection.getByRole("link", { name: "Otvori posetu", exact: true })).toHaveAttribute("href", `/visits/${scheduled.visitId}`);
    const review = page.getByRole("region", { name: "Čeka pregled · 1" });
    await expect(review.getByRole("link")).toHaveAttribute("href", `/visits/${submitted.visitId}/review`);
    await review.getByRole("link").click();
    await expect(page.getByRole("heading", { name: /Kancelarijski pregled/ })).toBeVisible();
    await page.goto("/office");
    await expect(page.getByRole("heading", { name: "Današnje posete · 1", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Čeka pregled · 1", exact: true })).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole("heading", { name: "Današnje posete · 1", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`office-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".staff-shell")).toHaveCSS("display", "block");
    await expect(page.locator("[data-staff-navigation]")).toBeHidden();
    await page.emulateMedia({ media: null });
    await page.setViewportSize(testInfo.project.use.viewport!);
    let nav = await openMenu(page);
    for (const href of ["/office","/schedule","/office/actions","/office/handover","/maintenance","/customers","/sites","/systems","/imports","/today","/visits/new"]) await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(nav.getByRole("link", { name: "Kancelarija", exact: true })).toHaveAttribute("aria-current", "page");
    await openWorkspaceControls(page);
    await expect(page.getByRole("navigation", { name: "Podešavanja i nalog" }).getByRole("link")).toHaveCount(4);
    if (testInfo.project.name === "phone") {
      await page.locator("summary:visible").filter({ hasText: "Meni tima" }).focus();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      nav = await openMenu(page);
    }
    await nav.getByRole("link", { name: "Raspored", exact: true }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    const filter = page.getByRole("form", { name: "Filteri rasporeda" });
    await filter.getByLabel("Datum", { exact: true }).fill(today);
    await filter.getByRole("combobox", { name: "Lokacija", exact: true }).selectOption(scheduled.siteId);
    await filter.getByRole("combobox", { name: "Član tima", exact: true }).selectOption(memberIds[1]);
    await filter.getByLabel("Prikaži i otkazane posete").check();
    await filter.getByRole("button", { name: "Prikaži raspored" }).click();
    await expect(page.getByRole("main").locator(`a[href="/maintenance/${planId}"]`)).toBeVisible();
    await page.getByRole("navigation", { name: "Prikaz rasporeda" }).getByRole("link", { name: "Nedeljni pregled" }).click();
    await expect(page.getByRole("region", { name: "Nedeljni raspored", exact: true })).toBeVisible();
    for (const link of await page.getByRole("navigation", { name: "Datumi rasporeda" }).getByRole("link").all()) {
      const query = new URL((await link.getAttribute("href"))!, "http://local.invalid").searchParams;
      expect(query.get("site")).toBe(scheduled.siteId); expect(query.get("technician")).toBe(memberIds[1]); expect(query.get("cancelled")).toBe("on");
    }
    await page.getByRole("navigation", { name: "Prikaz rasporeda" }).getByRole("link", { name: "Dnevni pregled" }).click();
    await page.getByRole("navigation", { name: "Datumi rasporeda" }).getByRole("link", { name: "Sledeći dan", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`date=${tomorrow}`));
    await expect(page.getByRole("main")).toContainText("Nema zakazanih poseta.");
    await page.getByRole("navigation", { name: "Datumi rasporeda" }).getByRole("link", { name: "Danas", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`date=${today}`));
    await page.getByRole("link", { name: "Poništi filtere", exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]site=/);
    await coordinatorPage.goto("/account");
    await coordinatorPage.getByRole("button", { name: `Otvori ${names[0]}`, exact: true }).click();
    await expect(coordinatorPage).toHaveURL(/\/office$/);
    const coordinatorNav = await openMenu(coordinatorPage);
    await expect(coordinatorNav.getByRole("link", { name: "Raspored", exact: true })).toBeVisible();
    await openWorkspaceControls(coordinatorPage);
    await expect(coordinatorPage.getByRole("navigation", { name: "Podešavanja i nalog" }).getByRole("link")).toHaveCount(1);
    await openWorkspaceControls(coordinatorPage);
    await coordinatorPage.getByRole("combobox", { name: "Radni prostor", exact: true }).selectOption(other);
    await coordinatorPage.getByRole("button", { name: "Otvori radni prostor", exact: true }).click();
    await expect(coordinatorPage).toHaveURL(/\/today$/);
    await expect(coordinatorPage.getByRole("main").getByText(names[1], { exact: true })).toBeVisible();
    const switchedNav = await openMenu(coordinatorPage);
    await expect(switchedNav.getByRole("link")).toHaveCount(1);
    expect((await coordinatorPage.request.get(`/api/field/visits/${scheduled.visitId}`)).status()).toBe(404);
    for (const [target, assigned] of [[technicianPage, true], [unassignedPage, false]] as const) {
      await target.goto("/today");
      const fieldNav = await openMenu(target);
      await expect(fieldNav.getByRole("link")).toHaveCount(1);
      await expect(fieldNav.getByRole("link", { name: "Danas", exact: true })).toBeVisible();
      expect((await target.request.get(`/api/field/visits/${scheduled.visitId}`)).status()).toBe(assigned ? 200 : 404);
      await target.goto("/office");
      await expect(target.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
      await target.goto("/schedule");
      await expect(target.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    }
    await page.goto("/office");
    await openWorkspaceControls(page);
    await page.getByRole("combobox", { name: "Radni prostor", exact: true }).selectOption(other);
    await page.getByRole("button", { name: "Otvori radni prostor", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Današnje posete · 0" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Čeka pregled · 0" })).toBeVisible();
    await expect(page.getByRole("main").getByText(scheduled.siteName, { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    if (organization) {
      await db.query("delete from public.maintenance_occurrences where organization_id=$1 and plan_id=$2", [organization,planId]);
      await db.query("delete from hvac_private.maintenance_jobs where organization_id=$1 and plan_id=$2", [organization,planId]);
      await db.query("delete from public.maintenance_plans where organization_id=$1 and id=$2", [organization,planId]);
    }
    await submitted?.dispose(); await scheduled?.dispose();
    await db.end();
    // Owner disposal removes its own organizations and their temporary memberships first.
    await owner.dispose();
    await Promise.all(users.slice(1).map(user => user.dispose()));
  }
});
