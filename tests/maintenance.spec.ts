import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
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
  await expect(page).toHaveURL(/\/(office|today)$/);
}
async function cleanup(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  const ids = (
    await fixture.db.query(
      "select id from public.maintenance_plans where organization_id=$1 and site_id=$2",
      [fixture.org, fixture.siteId],
    )
  ).rows.map((r) => r.id);
  for (const table of [
    "hvac_private.maintenance_events",
    "public.plan_systems",
    "public.maintenance_plan_assignees",
  ])
    await fixture.db.query(
      `delete from ${table} where organization_id=$1 and plan_id=any($2::uuid[])`,
      [fixture.org, ids],
    );
  await fixture.db.query(
    "delete from public.maintenance_plans where organization_id=$1 and id=any($2::uuid[])",
    [fixture.org, ids],
  );
  await fixture.db.query(
    "delete from public.systems where organization_id=$1 and site_id=$2 and not(id=any($3::uuid[]))",
    [fixture.org, fixture.siteId, fixture.systemIds],
  );
  await fixture.dispose();
}
test("office previews month end and DST, preserves an open editor and pauses/resumes without changing issued fieldwork", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture();
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const issued = await owner.rpc("issue_report", {
      ...scoped,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const before = (
      await fixture.db.query(
        "select to_jsonb(v) data from public.visits v where id=$1",
        [fixture.visitId],
      )
    ).rows;
    const findings = (
      await fixture.db.query(
        "select to_jsonb(i) data from public.visit_items i where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    const frozen = (
      await fixture.db.query(
        "select snapshot from public.report_revisions where id=$1",
        [issued.data],
      )
    ).rows;
    await login(page);
    await page.goto(`/maintenance/new?site=${fixture.siteId}`);
    const form = page.getByRole("form", { name: "Novi plan" });
    const title = `Fiktivni plan ${fixture.siteId.slice(0, 8)}`;
    await form.getByLabel("Naziv plana", { exact: true }).fill(title);
    await form
      .getByLabel("Početni datum (sidro)", { exact: true })
      .fill("2027-01-31");
    await form
      .getByLabel("Lokalno vreme početka", { exact: true })
      .fill("08:30");
    await form
      .getByLabel("Ponavljanje na broj meseci", { exact: true })
      .fill("1");
    await form
      .getByLabel("Pregled od datuma", { exact: true })
      .fill("2027-01-01");
    await form.getByRole("button", { name: "Pregledaj termine" }).click();
    await expect(form).toContainText("Izaberite najmanje jedan sistem.");
    await form.getByRole("checkbox", { name: /^KL-01/ }).check();
    await form.getByRole("checkbox", { name: /^KL-03/ }).check();
    await form
      .getByRole("checkbox", {
        name: "technician.a@hvac.example.invalid",
        exact: true,
      })
      .check();
    await form.getByRole("button", { name: "Pregledaj termine" }).click();
    const proposed = page.getByRole("region", {
      name: "Pregled unetih podataka",
    });
    await expect(proposed).toContainText("2027-02-28 08:30");
    await expect(proposed).toContainText("2027-03-31 08:30");
    await expect(proposed).toContainText("izvorni dan ostaje sidro");
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from public.maintenance_plans where site_id=$1",
          [fixture.siteId],
        )
      ).rows[0].n,
    ).toBe(0);
    await form
      .getByRole("button", { name: "Sačuvaj plan", exact: true })
      .click();
    await expect(page).toHaveURL(/\/maintenance\/[a-f0-9-]+$/);
    const id = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const detail = await owner.rpc("maintenance_detail", {
      ...scoped,
      p_plan_id: id,
    });
    expect(detail.error).toBeNull();
    expect(detail.data.systems).toHaveLength(2);
    expect(detail.data.members).toHaveLength(2);
    const editor = page.getByRole("form", { name: "Izmena plana" });
    await editor
      .getByLabel("Naziv plana", { exact: true })
      .fill("Neposlata izmena");
    await page
      .getByRole("button", { name: "Pauziraj plan", exact: true })
      .click();
    await expect(
      page.getByText("Pauziran plan · verzija 2", { exact: true }),
    ).toBeVisible();
    await expect(editor.getByLabel("Naziv plana", { exact: true })).toHaveValue(
      "Neposlata izmena",
    );
    await editor
      .getByRole("button", { name: "Sačuvaj plan", exact: true })
      .click();
    await expect(editor).toContainText("Plan ili vremenska zona su promenjeni");
    expect(
      (await owner.rpc("maintenance_detail", { ...scoped, p_plan_id: id })).data
        .name,
    ).toBe(title);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await editor
      .getByLabel("Naziv plana", { exact: true })
      .fill(title + " proleće");
    await editor
      .getByLabel("Početni datum (sidro)", { exact: true })
      .fill("2027-03-28");
    await editor
      .getByLabel("Lokalno vreme početka", { exact: true })
      .fill("02:30");
    await editor
      .getByLabel("Pregled od datuma", { exact: true })
      .fill("2027-03-01");
    await editor.getByRole("button", { name: "Pregledaj termine" }).click();
    await expect(proposed).toContainText("2027-03-28 03:00");
    await expect(proposed).toContainText("Nepostojeće vreme pomereno");
    await page.screenshot({
      path: info.outputPath("maintenance-gap-preview.png"),
      fullPage: true,
    });
    await editor
      .getByLabel("Lokalno vreme početka", { exact: true })
      .fill("02:31");
    await expect(editor).toContainText(
      "Podaci su promenjeni. Ponovite pregled termina.",
    );
    await editor
      .getByLabel("Lokalno vreme početka", { exact: true })
      .fill("02:30");
    await editor
      .getByRole("button", { name: "Sačuvaj plan", exact: true })
      .click();
    await expect(editor).toContainText("Plan je sačuvan.");
    await page
      .getByRole("button", { name: "Nastavi plan", exact: true })
      .click();
    await expect(
      page.getByText("Aktivan plan · verzija 4", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await fixture.db.query(
          "select to_jsonb(v) data from public.visits v where id=$1",
          [fixture.visitId],
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
    expect(
      (
        await fixture.db.query(
          "select snapshot from public.report_revisions where id=$1",
          [issued.data],
        )
      ).rows,
    ).toEqual(frozen);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from public.visits where site_id=$1",
          [fixture.siteId],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.reload();
    await editor
      .getByLabel("Početni datum (sidro)", { exact: true })
      .fill("2027-10-31");
    await editor
      .getByLabel("Pregled od datuma", { exact: true })
      .fill("2027-10-01");
    await editor.getByRole("button", { name: "Pregledaj termine" }).click();
    await expect(proposed).toContainText("Dvostruko lokalno vreme");
    await expect(proposed).toContainText("2027-10-31T00:30:00.000Z");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("maintenance-overlap-preview.png"),
      fullPage: true,
    });
    await page.goto("/maintenance?state=paused");
    await expect(
      page.getByRole("link", { name: title + " proleće", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Stanje plana", exact: true })
      .selectOption("active");
    await page.getByRole("button", { name: "Prikaži planove" }).click();
    await expect(
      page.getByRole("link", { name: title + " proleće", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("maintenance-list.png"),
      fullPage: true,
    });
  } finally {
    await cleanup(fixture);
  }
});
test("plan commands replay exactly, serialize edits and deny other organizations and field accounts", async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture({ submitted: false });
  const field = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const roster = await owner.rpc("workspace_roster", scoped);
    const tech = roster.data.find(
      (m: { email: string }) => m.email === "technician.a@hvac.example.invalid",
    ).membership_id;
    const id = randomUUID(),
      operation = randomUUID();
    const data = {
      siteId: fixture.siteId,
      name: "Fiktivan konkurentni plan",
      anchorDate: "2028-01-31",
      anchorTime: "08:30",
      intervalMonths: 1,
      durationMinutes: 60,
      timeZone: "Europe/Belgrade",
      systems: [fixture.systemIds[0]],
      members: [tech],
    };
    const command = {
      ...scoped,
      p_plan_id: id,
      p_operation_id: operation,
      p_kind: "create",
      p_version: 0,
      p_data: data,
    };
    const repeated = await Promise.all([
      owner.rpc("maintenance_plan_command", command),
      owner.rpc("maintenance_plan_command", command),
    ]);
    expect(repeated.map((r) => r.error)).toEqual([null, null]);
    expect(repeated.map((r) => r.data)).toEqual([id, id]);
    expect(
      (
        await owner.rpc("maintenance_plan_command", {
          ...command,
          p_data: { ...data, name: "Promenjen zahtev" },
        })
      ).error?.code,
    ).toBe("PT409");
    const edits = await Promise.all(
      ["Izmena A", "Izmena B"].map((name) =>
        owner.rpc("maintenance_plan_command", {
          ...command,
          p_operation_id: randomUUID(),
          p_kind: "edit",
          p_version: 1,
          p_data: { ...data, name },
        }),
      ),
    );
    expect(edits.filter((r) => !r.error)).toHaveLength(1);
    expect(edits.find((r) => r.error)?.error?.code).toBe("PT409");
    const detail = await owner.rpc("maintenance_detail", {
      ...scoped,
      p_plan_id: id,
    });
    expect(detail.error).toBeNull();
    expect(detail.data.version).toBe(2);
    expect(detail.data.history).toHaveLength(2);
    const preview = await owner.rpc("maintenance_preview", {
      ...scoped,
      p_data: data,
      p_from: "2028-02-01",
      p_count: 2,
    });
    expect(preview.error).toBeNull();
    expect(preview.data[0].intendedDate).toBe("2028-02-29");
    expect(preview.data[1].intendedDate).toBe("2028-03-31");
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const outsider = await api(email);
      expect(
        (await outsider.rpc("maintenance_plan_command", command)).error?.code,
      ).toBe("42501");
      expect(
        (await outsider.rpc("maintenance_detail", { ...scoped, p_plan_id: id }))
          .error?.code,
      ).toBe("42501");
      expect(
        (
          await outsider.rpc("maintenance_preview", {
            ...scoped,
            p_data: data,
            p_from: "2028-01-01",
          })
        ).error?.code,
      ).toBe("42501");
      const raw = await outsider
        .from("maintenance_plans")
        .select("id")
        .eq("id", id);
      expect(raw.error).toBeNull();
      expect(raw.data).toEqual([]);
    }
    // Existing selections must survive a bounded catalog that no longer lists them.
    await fixture.db.query(
      "insert into public.systems(id,organization_id,site_id,code,room) select gen_random_uuid(),$1,$2,'A-'||lpad(i::text,4,'0'),'Fiktivna dopuna' from generate_series(1,1000) i",
      [fixture.org, fixture.siteId],
    );
    const office = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    try {
      const editorPage = await office.newPage();
      await login(editorPage);
      await editorPage.goto(`/maintenance/${id}`);
      const editor = editorPage.getByRole("form", { name: "Izmena plana" });
      await expect(
        editor.getByRole("checkbox", { name: /^Prethodno izabran sistem/ }),
      ).toBeChecked();
      await editor
        .getByLabel("Naziv plana", { exact: true })
        .fill("Sačuvan izbor van prikaza");
      await editor
        .getByRole("button", { name: "Sačuvaj plan", exact: true })
        .click();
      await expect(editor).toContainText("Plan je sačuvan.");
      expect(
        (await owner.rpc("maintenance_detail", { ...scoped, p_plan_id: id }))
          .data.systems,
      ).toEqual(data.systems);
    } finally {
      await office.close();
    }
    const fieldPage = await field.newPage();
    await login(fieldPage, "technician.a@hvac.example.invalid");
    await fieldPage.goto(`/maintenance/${id}`);
    await expect(
      fieldPage.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
  } finally {
    await field.close();
    await cleanup(fixture);
  }
});
