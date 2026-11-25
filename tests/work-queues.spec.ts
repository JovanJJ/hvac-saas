import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { shiftDate } from "../features/scheduling/model";
import { workerClient } from "../src/worker/client";
import { claimMaintenance, executeMaintenance } from "../src/worker/maintenance";
async function api(email = "owner.a@hvac.example.invalid") {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email, password: process.env.SEED_PASSWORD! })).error).toBeNull();
    return client;
}
async function login(page: Page, email = "owner.a@hvac.example.invalid") {
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill(email);
    await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/(office|today|onboarding)$/);
}
test("office finds overdue quotes and access-dependent returns, books once and newly assigned technician opens source history", async ({ page, browser }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    // The technician has no original assignment and gains access through the new return visit.
    const fixture = await createReportFixture({ technicianId: "a1000000-0000-4000-8000-000000000101" });
    const owner = await api();
    const tech = await api("technician.a@hvac.example.invalid");
    const org = { p_organization_id: fixture.org };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Belgrade" });
    const tomorrow = shiftDate(today, 1);
    const techContext = await browser.newContext({ viewport: info.project.use.viewport });
    try {
        const tasks = (await owner.rpc("follow_up_list", org)).data.filter((a: {
            visitId: string;
        }) => a.visitId === fixture.visitId);
        const quote = tasks.find((a: {
            kind: string;
        }) => a.kind === "quote");
        const revisit = tasks.find((a: {
            kind: string;
        }) => a.kind === "revisit");
        const roster = (await owner.rpc("workspace_roster", org)).data;
        const member = (email: string) => roster.find((m: {
            email: string;
        }) => m.email === email).membership_id;
        const techId = member("technician.a@hvac.example.invalid");
        for (const [task, due, responsible] of [[quote, shiftDate(today, -1), member("owner.a@hvac.example.invalid")], [revisit, today, techId]]) {
            expect((await owner.rpc("follow_up_command", { ...org, p_action_id: task.id, p_operation_id: randomUUID(), p_version: task.version, p_kind: "assign", p_data: { ownerId: responsible, dueDate: due } })).error).toBeNull();
        }
        expect((await tech.rpc("visit_bundle", { ...org, p_visit_id: fixture.visitId })).error).not.toBeNull();
        await login(page);
        await page.goto(`/office/actions?site=${fixture.siteId}&due=overdue`);
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article")).toContainText("Priprema ponude");
        await expect(page.getByRole("article")).toContainText("U kašnjenju");
        await page.screenshot({ path: info.outputPath("overdue-quote.png"), fullPage: true });
        const filters = page.getByRole("form", { name: "Filteri obaveza" });
        await filters.getByLabel("Odgovoran član").selectOption(techId);
        await filters.getByLabel("Rok", { exact: true }).selectOption("today");
        await filters.getByLabel("Zahtev za klijenta").selectOption("required");
        await filters.getByRole("button", { name: "Prikaži obaveze" }).click();
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article")).toContainText("Obezbediti pristup");
        await expect(page.getByRole("article")).toContainText("Povratna poseta još nije zakazana");
        const before = await fixture.db.query("select id,outcome,work,finding,no_access_reason,entered_by from public.visit_items where visit_id=$1 order by id", [fixture.visitId]);
        await page.getByRole("link", { name: "Zakaži povratnu posetu", exact: true }).click();
        await page.getByLabel("Početak", { exact: true }).fill(`${tomorrow}T09:00`);
        await page.getByLabel("Završetak", { exact: true }).fill(`${tomorrow}T10:00`);
        await page.locator(`input[name="members"][value="${techId}"]`).check();
        await page.getByRole("button", { name: "Zakaži povratnu posetu", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Zakazana povratna poseta" })).toBeVisible();
        const payload = { start: `${tomorrow}T09:00`, end: `${tomorrow}T10:00`, members: [techId] };
        const repeats = await Promise.all([1, 2].map(() => owner.rpc("follow_up_command", { ...org, p_action_id: revisit.id, p_operation_id: randomUUID(), p_version: revisit.version + 1, p_kind: "book", p_data: payload })));
        expect(repeats[0].error).toBeNull();
        expect(repeats[1].error).toBeNull();
        expect(repeats[0].data).toBe(repeats[1].data);
        const returnId = repeats[0].data;
        await page.goto(`/office/actions?site=${fixture.siteId}&due=today&booking=booked&dependency=required&owner=${techId}`);
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article").getByRole("definition")).toHaveText(["technician.a@hvac.example.invalid", today]);
        await expect(page.getByRole("article")).toContainText("Stanje: Otvoreno");
        await expect(page.getByRole("link", { name: "Raspored povratne posete" })).toHaveAttribute("href", `/schedule/${returnId}`);
        await page.getByRole("link", { name: "Otvori izvorni nalaz" }).click();
        await expect(page.locator(`#system-${revisit.itemId}`)).toContainText("Zaključana arhiva");
        const techPage = await techContext.newPage();
        techPage.setDefaultTimeout(10000);
        await login(techPage, "technician.a@hvac.example.invalid");
        await techPage.goto(`/visits/${returnId}`);
        await expect(techPage.getByRole("heading", { name: /Izvorni nalaz za povratnu posetu/ })).toBeVisible();
        await expect(techPage.getByText("Potrebno od klijenta: Obezbediti pristup")).toBeVisible();
        await techPage.getByRole("link", { name: /^Istorija sistema ·/ }).click();
        await expect(techPage.getByText("Bez pristupa: Zaključana arhiva", { exact: true })).toBeVisible();
        expect((await fixture.db.query("select id,outcome,work,finding,no_access_reason,entered_by from public.visit_items where visit_id=$1 order by id", [fixture.visitId])).rows).toEqual(before.rows);
        await page.goto(`/office/actions?site=${fixture.siteId}&due=today&booking=booked&dependency=required`);
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("link", { name: "Raspored povratne posete" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath("booked-dependency.png"), fullPage: true });
        // The live queue reflects cancellation independently of its still-open action deadline.
        const detail = await owner.rpc("schedule_visit_detail", { ...org, p_visit_id: returnId });
        expect((await owner.rpc("schedule_visit_command", { ...org, p_visit_id: returnId, p_operation_id: randomUUID(), p_kind: "cancel", p_version: detail.data.version, p_data: { reason: "Fiktivno otkazivanje" } })).error).toBeNull();
        await page.goto(`/office/actions?site=${fixture.siteId}&booking=cancelled`);
        await expect(page.getByRole("article")).toContainText("Povratna poseta: Otkazano");
        await expect(page.getByRole("article")).toContainText("Stanje: Otvoreno");
        for (const email of ["owner.b@hvac.example.invalid", "unassigned@hvac.example.invalid"]) {
            const denied = await api(email);
            expect((await denied.rpc("office_work_queue", { ...org, p_filters: { site: fixture.siteId } })).error).not.toBeNull();
            await denied.auth.signOut({ scope: "local" });
        }
        expect((await tech.rpc("office_work_queue", { ...org, p_filters: {} })).error).not.toBeNull();
    }
    finally {
        await techContext.close();
        await owner.auth.signOut({ scope: "local" });
        await tech.auth.signOut({ scope: "local" });
        await fixture.db.query("delete from hvac_private.schedule_events where visit_id in(select f.return_visit_id from public.follow_ups f join public.visit_items i on i.id=f.item_id where i.visit_id=$1)", [fixture.visitId]);
        await fixture.dispose();
    }
});
test("maintenance queue distinguishes proposed and generated attendance with retained filters and paused plans", async ({ page }, info) => {
    test.setTimeout(90000);
    page.setDefaultTimeout(10000);
    const fixture = await createReportFixture();
    const owner = await api();
    const worker = await workerClient();
    const planId = randomUUID();
    const org = { p_organization_id: fixture.org };
    const tomorrow = shiftDate(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Belgrade" }), 1);
    try {
        const techId = (await owner.rpc("workspace_roster", org)).data.find((m: {
            email: string;
        }) => m.email === "technician.a@hvac.example.invalid").membership_id;
        expect((await owner.rpc("maintenance_plan_command", { ...org, p_plan_id: planId, p_operation_id: randomUUID(), p_kind: "create", p_version: 0, p_data: { siteId: fixture.siteId, name: "Fiktivno održavanje M5g", anchorDate: tomorrow, anchorTime: "08:00", timeZone: "Europe/Belgrade", intervalMonths: 6, durationMinutes: 60, systems: fixture.systemIds, members: [techId] } })).error).toBeNull();
        await login(page);
        await page.goto(`/office/actions?queue=maintenance&site=${fixture.siteId}&owner=${techId}`);
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article")).toContainText("Predlog termina");
        await expect(page.getByRole("article")).toContainText(tomorrow);
        const job = await claimMaintenance(worker, planId);
        expect(job).not.toBeNull();
        await executeMaintenance(worker, job!);
        await page.reload();
        await expect(page.getByRole("article")).toHaveCount(2);
        await expect(page.getByRole("link", { name: "Raspored posete", exact: true })).toHaveCount(1);
        const filters = page.getByRole("form", { name: "Filteri obaveza" });
        await filters.getByLabel("Priprema termina").selectOption("booked");
        await filters.getByLabel("Rok", { exact: true }).selectOption("upcoming");
        await filters.getByRole("button", { name: "Prikaži obaveze" }).click();
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article")).toContainText("Zakazano");
        expect(new URL(page.url()).searchParams.get("owner")).toBe(techId);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath("maintenance-queue.png"), fullPage: true });
        expect((await owner.rpc("maintenance_plan_command", { ...org, p_plan_id: planId, p_operation_id: randomUUID(), p_kind: "set_enabled", p_version: 1, p_data: { enabled: false } })).error).toBeNull();
        await page.goto(`/office/actions?queue=maintenance&site=${fixture.siteId}&state=paused`);
        await expect(page.getByRole("article")).toHaveCount(1);
        await expect(page.getByRole("article")).toContainText("Pauziran plan");
        await expect(page.getByRole("article").getByRole("link", { name: "Fiktivno održavanje M5g" })).toHaveAttribute("href", `/maintenance/${planId}`);
    }
    finally {
        await owner.auth.signOut({ scope: "local" });
        worker.auth.stopAutoRefresh();
        await worker.auth.signOut({ scope: "local" });
        const visits = (await fixture.db.query("select visit_id from public.maintenance_occurrences where plan_id=$1", [planId])).rows.map(r => r.visit_id);
        await fixture.db.query("delete from public.maintenance_occurrences where plan_id=$1", [planId]);
        await fixture.db.query("delete from hvac_private.maintenance_generation_receipts where job_id in(select id from hvac_private.maintenance_jobs where plan_id=$1)", [planId]);
        await fixture.db.query("delete from hvac_private.maintenance_jobs where plan_id=$1", [planId]);
        await fixture.db.query("delete from hvac_private.maintenance_events where plan_id=$1", [planId]);
        await fixture.db.query("delete from public.plan_systems where plan_id=$1", [planId]);
        await fixture.db.query("delete from public.maintenance_plan_assignees where plan_id=$1", [planId]);
        await fixture.db.query("delete from public.maintenance_plans where id=$1", [planId]);
        await fixture.db.query("delete from public.visit_items where visit_id=any($1::uuid[])", [visits]);
        await fixture.db.query("delete from public.visit_assignees where visit_id=any($1::uuid[])", [visits]);
        await fixture.db.query("delete from public.visits where id=any($1::uuid[])", [visits]);
        await fixture.dispose();
    }
});
