import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { shiftDate } from "../features/scheduling/model";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
  "base64",
);
async function api(email = "owner.a@hvac.example.invalid") {
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
async function login(page: Page, email = "owner.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}
async function outbox(page: Page, visitId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("teren-field");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<{
        operations: string[];
        photos: { id: string; bytes: number }[];
      }>((resolve, reject) => {
        const tx = db.transaction(["drafts", "photos"], "readonly"),
          drafts = tx.objectStore("drafts").getAll(),
          photos = tx.objectStore("photos").getAll();
        tx.oncomplete = () =>
          resolve({
            operations: drafts.result
              .filter((row) => row.visitId === id)
              .map((row) => row.operationId),
            photos: photos.result
              .filter((row) => row.visitId === id)
              .map((row) => ({ id: row.id, bytes: row.blob?.size ?? 0 })),
          });
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, visitId);
}
test("office moves and filters a visit, reassigns offline work and cancels without losing findings or device drafts", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  const fixture = await createReportFixture({ submitted: false });
  const techContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const original = await owner.rpc("visit_bundle", {
      ...scoped,
      p_visit_id: fixture.visitId,
    });
    expect(original.error).toBeNull();
    const today = new Date(original.data.start).toLocaleDateString("en-CA", {
        timeZone: original.data.timeZone,
      }),
      tomorrow = shiftDate(today, 1);
    const before = (
      await fixture.db.query(
        "select id,outcome,work,finding,entered_by,version from public.visit_items where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    const tech = await techContext.newPage();
    await login(tech, "technician.a@hvac.example.invalid");
    const card = tech.getByRole("article").filter({
      has: tech.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    await techContext.setOffline(true);
    await tech.goto(`/visits/${fixture.visitId}`);
    const editor = tech.getByRole("region", { name: /^Unos / }).first();
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivan neposlat nalaz M5b");
    await expect(editor.getByRole("status")).toContainText(
      "Sačuvano na telefonu",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await expect(editor.getByRole("status")).toContainText("Čeka slanje");
    const photos = tech
      .getByRole("region", { name: /^Fotografije na telefonu / })
      .first();
    await photos.getByLabel("Izaberite fotografiju").setInputFiles({
      name: "fictional.png",
      mimeType: "image/png",
      buffer: png,
    });
    await photos
      .getByLabel("Opis fotografije")
      .fill("Fiktivna neposlata fotografija M5b");
    await photos.getByLabel("Vidljivost fotografije").selectOption("internal");
    await photos
      .getByRole("button", {
        name: "Sačuvaj fotografiju na telefonu",
        exact: true,
      })
      .click();
    await expect(
      photos.getByRole("img", {
        name: "Fiktivna neposlata fotografija M5b",
        exact: true,
      }),
    ).toBeVisible();
    const retained = await outbox(tech, fixture.visitId);
    await login(page);
    await page.goto(`/schedule/${fixture.visitId}`);
    const move = page.getByRole("form", {
      name: "Promena termina",
      exact: true,
    });
    await move.getByLabel("Novi početak").fill(`${tomorrow}T09:30`);
    await move.getByLabel("Novi završetak").fill(`${tomorrow}T10:30`);
    await move
      .getByRole("button", { name: "Sačuvaj novi termin", exact: true })
      .click();
    await expect(move.getByRole("status")).toContainText(
      "Promena rasporeda je sačuvana",
    );
    await page.goto(`/schedule?date=${tomorrow}&site=${fixture.siteId}`);
    let scheduled = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await expect(scheduled).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("link", { name: "Sledeći dan", exact: true }).click();
    await expect(scheduled).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("site")).toBe(fixture.siteId);
    await page
      .getByRole("link", { name: "Prethodni dan", exact: true })
      .click();
    await expect(scheduled).toBeVisible();
    const filters = page.getByRole("form", {
      name: "Filteri rasporeda",
      exact: true,
    });
    await filters
      .getByRole("combobox", { name: "Prikaz", exact: true })
      .selectOption("week");
    await filters
      .getByRole("button", { name: "Prikaži raspored", exact: true })
      .click();
    await expect(scheduled).toBeVisible();
    const weekBoard = page.getByRole("region", { name: "Nedeljni raspored", exact: true });
    await expect(weekBoard.locator(":scope > section")).toHaveCount(7);
    await expect(weekBoard.getByText("Broj poseta: 0", { exact: true })).toHaveCount(6);
    await page.getByRole("link", { name: "Dnevni pregled", exact: true }).click();
    await expect(weekBoard).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("site")).toBe(fixture.siteId);
    await page.getByRole("link", { name: "Nedeljni pregled", exact: true }).click();
    await expect(weekBoard).toBeVisible();
    await expect(scheduled).toBeVisible();
    await filters
      .getByRole("combobox", { name: "Član tima", exact: true })
      .selectOption({ label: "owner.a@hvac.example.invalid" });
    await filters
      .getByRole("button", { name: "Prikaži raspored", exact: true })
      .click();
    await expect(scheduled).toHaveCount(0);
    await filters
      .getByRole("combobox", { name: "Član tima", exact: true })
      .selectOption({ label: "technician.a@hvac.example.invalid" });
    await filters
      .getByRole("button", { name: "Prikaži raspored", exact: true })
      .click();
    await expect(scheduled).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("schedule-filters.png"),
      fullPage: true,
    });
    await page.goto(`/schedule/${fixture.visitId}`);
    const assign = page.getByRole("form", {
      name: "Promena dodele",
      exact: true,
    });
    await assign
      .getByRole("checkbox", {
        name: "technician.a@hvac.example.invalid",
        exact: true,
      })
      .uncheck();
    await assign
      .getByRole("checkbox", {
        name: "owner.a@hvac.example.invalid",
        exact: true,
      })
      .check();
    await assign
      .getByRole("button", { name: "Sačuvaj dodelu", exact: true })
      .click();
    await expect(assign.getByRole("status")).toBeVisible();
    await techContext.setOffline(false);
    await expect(
      tech.getByRole("region", { name: "Zadržan lokalni rad", exact: true }),
    ).toContainText("Nacrti: 1");
    await expect(
      tech.getByRole("region", { name: "Zadržan lokalni rad", exact: true }),
    ).toContainText("Fotografije: 1");
    expect(await outbox(tech, fixture.visitId)).toEqual(retained);
    expect(
      (await tech.request.get(`/api/field/visits/${fixture.visitId}`)).status(),
    ).toBe(404);
    expect(
      (
        await fixture.db.query(
          "select id,outcome,work,finding,entered_by,version from public.visit_items where visit_id=$1 order by id",
          [fixture.visitId],
        )
      ).rows,
    ).toEqual(before);
    await tech.goto("/today");
    await expect(
      tech.getByRole("heading", { name: fixture.siteName, exact: true }),
    ).toHaveCount(0);
    await page.reload();
    const back = page.getByRole("form", {
      name: "Promena termina",
      exact: true,
    });
    await back.getByLabel("Novi početak").fill(`${today}T11:00`);
    await back.getByLabel("Novi završetak").fill(`${today}T12:00`);
    await back
      .getByRole("button", { name: "Sačuvaj novi termin", exact: true })
      .click();
    await expect(back.getByRole("status")).toBeVisible();
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: fixture.siteName, exact: true }),
    ).toBeVisible();
    await page.goto(`/schedule/${fixture.visitId}`);
    const cancel = page.getByRole("form", {
      name: "Otkazivanje posete",
      exact: true,
    });
    await cancel.getByLabel("Razlog otkazivanja", { exact: true }).fill("   ");
    await cancel.getByRole("checkbox").check();
    await cancel
      .getByRole("button", { name: "Otkaži posetu", exact: true })
      .click();
    await expect(
      cancel.getByText("Unesite razlog otkazivanja.", { exact: true }),
    ).toBeVisible();
    await cancel
      .getByLabel("Razlog otkazivanja", { exact: true })
      .fill("Fiktivan zahtev klijenta za otkazivanje");
    await cancel
      .getByRole("button", { name: "Otkaži posetu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Poseta je otkazana", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Istorija rasporeda", exact: true })
        .getByRole("article"),
    ).toHaveCount(4);
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: fixture.siteName, exact: true }),
    ).toHaveCount(0);
    await page.goto(`/schedule?date=${today}&site=${fixture.siteId}`);
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.getByLabel("Prikaži i otkazane posete", { exact: true }).check();
    await page
      .getByRole("button", { name: "Prikaži raspored", exact: true })
      .click();
    scheduled = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await expect(scheduled).toContainText("Otkazano");
    await expect(scheduled).toContainText("Fiktivan zahtev klijenta");
    await page.goto(`/visits/${fixture.visitId}/review`);
    await expect(
      page.getByText("Stanje: Otkazano", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Nalaz: Oštećen deflektor", { exact: true }),
    ).toBeVisible();
    expect(
      (await page.request.get(`/api/field/visits/${fixture.visitId}`)).status(),
    ).toBe(404);
    expect(await outbox(tech, fixture.visitId)).toEqual(retained);
    await page.goto(`/schedule/${fixture.visitId}`);
    await expect(page.getByRole("heading",{name:"Poseta je otkazana",exact:true})).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("cancelled-schedule-history.png"),
      fullPage: true,
    });
  } finally {
    await techContext.close();
    await fixture.db.query(
      "delete from hvac_private.schedule_events where organization_id=$1 and visit_id=$2",
      [fixture.org, fixture.visitId],
    );
    await fixture.dispose();
  }
});
test("schedule changes replay once and serialize against field submission with tenant and technician denial", async () => {
  const fixture = await createReportFixture({ submitted: false });
  try {
    const owner = await api(),
      tech = await api("technician.a@hvac.example.invalid"),
      other = await api("owner.b@hvac.example.invalid"),
      unassigned = await api("unassigned@hvac.example.invalid"),
      scoped = { p_organization_id: fixture.org, p_visit_id: fixture.visitId };
    const bundle = await owner.rpc("visit_bundle", scoped);
    const version = bundle.data.version;
    const command = {
      ...scoped,
      p_operation_id: randomUUID(),
      p_kind: "reschedule",
      p_version: version,
      p_data: {
        start: "2026-12-20T09:00",
        end: "2026-12-20T10:00",
        timeZone: bundle.data.timeZone,
      },
    };
    const [schedule, submission] = await Promise.all([
      owner.rpc("schedule_visit_command", command),
      tech.rpc("replay_field_command", {
        ...scoped,
        p_operation_id: randomUUID(),
        p_kind: "submit",
        p_version: version,
        p_data: {},
      }),
    ]);
    expect(
      [schedule, submission].filter((result) => !result.error),
    ).toHaveLength(1);
    expect(
      [schedule, submission].find((result) => result.error)?.error?.code,
    ).toBe("PT409");
    if (!schedule.error) {
      expect(
        (await owner.rpc("schedule_visit_command", command)).error,
      ).toBeNull();
      expect(
        (
          await owner.rpc("schedule_visit_command", {
            ...command,
            p_data: {
              ...command.p_data,
              start: "2026-12-21T09:00",
              end: "2026-12-21T10:00",
            },
          })
        ).error?.code,
      ).toBe("PT409");
      const current = await owner.rpc("visit_bundle", scoped);
      expect(
        (
          await tech.rpc("replay_field_command", {
            ...scoped,
            p_operation_id: randomUUID(),
            p_kind: "submit",
            p_version: current.data.version,
            p_data: {},
          })
        ).error,
      ).toBeNull();
    }
    const current = await owner.rpc("visit_bundle", scoped);
    expect(current.data.status).toBe("submitted");
    expect(
      (
        await owner.rpc("schedule_visit_command", {
          ...command,
          p_operation_id: randomUUID(),
          p_kind: "cancel",
          p_version: current.data.version,
          p_data: { reason: "Denied submitted" },
        })
      ).error?.code,
    ).toBe("PT409");
    for (const client of [tech, other, unassigned]) {
      expect(
        (await client.rpc("schedule_visit_command", command)).error?.code,
      ).toBe("42501");
      expect(
        (await client.rpc("schedule_visit_detail", scoped)).error?.code,
      ).toBe("42501");
    }
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from public.visit_items where visit_id=$1",
          [fixture.visitId],
        )
      ).rows[0].count,
    ).toBe(4);
  } finally {
    await fixture.db.query(
      "delete from hvac_private.schedule_events where organization_id=$1 and visit_id=$2",
      [fixture.org, fixture.visitId],
    );
    await fixture.dispose();
  }
});
