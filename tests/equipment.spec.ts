import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
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
async function cleanRegister(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  const ids = [fixture.customerId, fixture.siteId, ...fixture.systemIds];
  await fixture.db.query(
    "delete from hvac_private.register_events where organization_id=$1 and (entity_id=any($2::uuid[]) or entity_id in(select id from public.units where organization_id=$1 and system_id=any($2::uuid[])))",
    [fixture.org, ids],
  );
  await fixture.db.query(
    "delete from public.units where organization_id=$1 and system_id=any($2::uuid[])",
    [fixture.org, fixture.systemIds],
  );
}
test("office replaces a component and archives equipment; next assigned technician reads history and the issued PDF stays unchanged", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture();
  const next = randomUUID();
  const sys = fixture.systemIds[2];
  const techContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  let worker: Awaited<ReturnType<typeof workerClient>> | undefined;
  try {
    const owner = await api();
    const scoped = { p_organization_id: fixture.org };
    const issued = await owner.rpc("issue_report", {
      ...scoped,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const revision = issued.data as string;
    worker = await workerClient();
    const job = await claimJob(worker, revision);
    expect(job).not.toBeNull();
    await processJob(worker, job!);
    const before = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: revision,
    });
    expect(before.error).toBeNull();
    const original = await owner.storage
      .from("report-pdfs")
      .download(before.data.artifact.path);
    expect(original.error).toBeNull();
    const originalHash = hash(Buffer.from(await original.data!.arrayBuffer()));
    const roster = await owner.rpc("workspace_roster", scoped);
    const member = roster.data.find(
      (row: { email: string }) =>
        row.email === "technician.a@hvac.example.invalid",
    ).membership_id;
    expect(
      (
        await owner.rpc("save_operation", {
          ...scoped,
          p_operation_id: next,
          p_kind: "visit",
          p_data: {
            siteId: fixture.siteId,
            visitType: "maintenance",
            start: "2026-11-23T09:00",
            end: "2026-11-23T10:00",
            members: [member],
            systems: [sys],
          },
        })
      ).error,
    ).toBeNull();
    await fixture.db.query(
      "delete from public.visit_assignees where visit_id=$1 and membership_id=$2",
      [fixture.visitId, member],
    );
    await login(page);
    await page.goto(`/customers/${fixture.customerId}`);
    let edit = page.getByRole("form", { name: "Uredi podatke", exact: true });
    await edit.getByLabel("Naziv klijenta", { exact: true }).fill("   ");
    await edit
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(
      edit.getByText("Obavezno polje.", { exact: true }),
    ).toBeVisible();
    await expect(
      edit.getByLabel("Naziv klijenta", { exact: true }),
    ).toHaveValue("   ");
    await edit
      .getByLabel("Naziv klijenta", { exact: true })
      .fill(`Fiktivan izmenjen klijent ${fixture.customerId.slice(0, 8)}`);
    await edit
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(edit.getByRole("status")).toHaveText("Promena je sačuvana.");
    await page.goto(`/sites/${fixture.siteId}`);
    edit = page.getByRole("form", { name: "Uredi podatke", exact: true });
    await edit
      .getByLabel("Adresa", { exact: true })
      .fill("Fiktivna nova adresa 5, Jagodina");
    await edit
      .getByLabel("Kontakt lokacije", { exact: true })
      .fill("Fiktivan kontakt lokacije");
    await edit
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(edit.getByRole("status")).toBeVisible();
    await page.goto(`/systems/${sys}`);
    edit = page.getByRole("form", { name: "Uredi podatke", exact: true });
    await edit
      .getByLabel("Model", { exact: true })
      .fill("Fiktivan nov model sistema");
    await edit
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(edit.getByRole("status")).toBeVisible();
    await page.reload(); // Successful edits require a fresh form before the next command.
    const add = page.getByRole("form", {
      name: "Dodaj komponentu",
      exact: true,
    });
    await add.getByLabel("Vrsta komponente").selectOption("outdoor");
    await add
      .getByLabel("Model", { exact: true })
      .fill("Fiktivna stara jedinica");
    await add.getByLabel("Serijski broj", { exact: true }).fill("M5A-OLD");
    await add
      .getByRole("button", { name: "Dodaj komponentu", exact: true })
      .click();
    const old = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Spoljašnja jedinica · Fiktivna stara jedinica",
        exact: true,
      }),
    });
    await expect(old).toBeVisible();
    await old
      .locator("summary")
      .filter({ hasText: "Zameni komponentu" })
      .click();
    const replace = old.getByRole("form", {
      name: "Nova komponenta",
      exact: true,
    });
    await replace
      .getByLabel("Model", { exact: true })
      .fill("Fiktivna nova jedinica");
    await replace
      .getByLabel("Serijski broj", { exact: true })
      .fill("M5A-NEW-" + "A".repeat(96));
    await replace.getByRole("checkbox").check();
    await replace
      .getByRole("button", { name: "Zameni komponentu", exact: true })
      .click();
    await expect(
      old.getByText("Arhivirana komponenta", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Spoljašnja jedinica · Fiktivna nova jedinica",
        exact: true,
      }),
    ).toBeVisible();
    const archive = page.getByRole("form", {
      name: "Arhiviranje zapisa",
      exact: true,
    });
    await archive.getByRole("checkbox").check();
    await archive
      .getByRole("button", { name: "Arhiviraj", exact: true })
      .click();
    await expect(
      page.getByText("Arhivirano · istorija je sačuvana", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from public.units where system_id=$1",
          [sys],
        )
      ).rows[0].count,
    ).toBe(2);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from public.visit_items where system_id=$1",
          [sys],
        )
      ).rows[0].count,
    ).toBe(2);
    const freshPreview = await owner.rpc("report_preview", {
      ...scoped,
      p_visit_id: next,
    });
    expect(freshPreview.error).toBeNull();
    expect(freshPreview.data.data.contact).toBe("Fiktivan kontakt lokacije");
    const again = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: revision,
    });
    expect(again.data).toEqual(before.data);
    const pdf = await owner.storage
      .from("report-pdfs")
      .download(again.data.artifact.path);
    expect(hash(Buffer.from(await pdf.data!.arrayBuffer()))).toBe(originalHash);
    await expect(
      page.getByRole("region", { name: "Servisna istorija", exact: true }),
    ).toContainText("Oštećen deflektor");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("archived-system-history.png"),
      fullPage: true,
    });
    const tech = await techContext.newPage();
    await login(tech, "technician.a@hvac.example.invalid");
    await tech.goto(`/visits/${next}`);
    await tech
      .getByRole("link", { name: "Istorija sistema · KL-03", exact: true })
      .click();
    await expect(
      tech.getByRole("region", { name: "Servisna istorija", exact: true }),
    ).toContainText("Oštećen deflektor");
    await expect(
      tech.getByRole("form", { name: "Uredi podatke", exact: true }),
    ).toHaveCount(0);
    await expect(
      tech.getByRole("link", { name: "Otvori izvorni nalaz", exact: true }),
    ).toHaveCount(0);
    expect(
      await tech.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await tech.screenshot({
      path: info.outputPath("assigned-system-history.png"),
      fullPage: true,
    });
    await tech.goto(`/systems/${fixture.systemIds[0]}`);
    await expect(
      tech.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
  } finally {
    await techContext.close();
    if (worker) {
      worker.auth.stopAutoRefresh();
      await worker.auth.signOut({ scope: "local" });
    }
    for (const table of ["visit_items", "visit_assignees", "visits"])
      await fixture.db.query(
        `delete from public.${table} where ${table === "visits" ? "id" : "visit_id"}=$1`,
        [next],
      );
    await fixture.db.query(
      "delete from hvac_private.operation_receipts where organization_id=$1 and operation_id=$2",
      [fixture.org, next],
    );
    await cleanRegister(fixture);
    await fixture.dispose();
  }
});

test("register commands reject stale edits, deduplicate replacement, serialize competing replacements and isolate history", async () => {
  const fixture = await createReportFixture({ submitted: false });
  const sys = fixture.systemIds[0],
    scoped = { p_organization_id: fixture.org };
  try {
    const owner = await api(),
      other = await api("owner.b@hvac.example.invalid"),
      unassigned = await api("unassigned@hvac.example.invalid"),
      technician = await api("technician.a@hvac.example.invalid");
    const operation = randomUUID();
    const command = {
      ...scoped,
      p_entity_id: sys,
      p_operation_id: operation,
      p_kind: "system.update",
      p_version: 1,
      p_data: {
        code: "KL-01",
        room: "Izmenjena prostorija",
        model: "Fiktivan model",
      },
    };
    expect((await owner.rpc("register_command", command)).error).toBeNull();
    expect((await owner.rpc("register_command", command)).error).toBeNull();
    expect(
      (
        await owner.rpc("register_command", {
          ...command,
          p_data: { ...command.p_data, room: "Drugi zahtev" },
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      (
        await owner.rpc("register_command", {
          ...command,
          p_operation_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    const unit = randomUUID();
    const add = {
      ...scoped,
      p_entity_id: sys,
      p_operation_id: unit,
      p_kind: "unit.create",
      p_version: 2,
      p_data: { role: "indoor", model: "Fiktivno" },
    };
    expect((await owner.rpc("register_command", add)).error).toBeNull();
    expect((await owner.rpc("register_command", add)).error).toBeNull();
    const attempts = await Promise.all(
      [1, 2].map((index) =>
        owner.rpc("register_command", {
          ...scoped,
          p_entity_id: unit,
          p_operation_id: randomUUID(),
          p_kind: "unit.replace",
          p_version: 1,
          p_data: { role: "indoor", model: `Zamena ${index}` },
        }),
      ),
    );
    expect(attempts.filter((result) => !result.error)).toHaveLength(1);
    expect(attempts.find((result) => result.error)?.error?.code).toBe("PT409");
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from public.units where system_id=$1",
          [sys],
        )
      ).rows[0].count,
    ).toBe(2);
    for (const client of [other, unassigned])
      expect(
        (
          await client.rpc("register_detail", {
            ...scoped,
            p_kind: "system",
            p_entity_id: sys,
          })
        ).error?.code,
      ).toBe("42501");
    expect(
      (
        await technician.rpc("register_detail", {
          ...scoped,
          p_kind: "system",
          p_entity_id: sys,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await technician.rpc("register_detail", {
          ...scoped,
          p_kind: "customer",
          p_entity_id: fixture.customerId,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (await technician.rpc("register_command", command)).error?.code,
    ).toBe("42501");
    expect(
      (await technician.from("units").select("id").eq("system_id", sys)).data,
    ).toEqual([]);
  } finally {
    await cleanRegister(fixture);
    await fixture.dispose();
  }
});

test("a component save cannot silently rebase another open metadata editor", async ({
  page,
}) => {
  const fixture = await createReportFixture({ submitted: false });
  try {
    const owner = await api(),
      sys = fixture.systemIds[0],
      unit = randomUUID();
    const scoped = { p_organization_id: fixture.org };
    expect(
      (
        await owner.rpc("register_command", {
          ...scoped,
          p_entity_id: sys,
          p_operation_id: unit,
          p_kind: "unit.create",
          p_version: 1,
          p_data: { role: "indoor", model: "Fiktivna jedinica" },
        })
      ).error,
    ).toBeNull();
    await login(page);
    await page.goto(`/systems/${sys}`);
    const edit = page.getByRole("form", { name: "Uredi podatke", exact: true });
    const operation = await edit
      .locator('input[name="operationId"]')
      .inputValue();
    await edit
      .getByLabel("Model", { exact: true })
      .fill("Lokalna nesnimljena izmena");
    expect(
      (
        await owner.rpc("register_command", {
          ...scoped,
          p_entity_id: sys,
          p_operation_id: randomUUID(),
          p_kind: "system.update",
          p_version: 1,
          p_data: {
            code: "KL-01",
            room: "Recepcija",
            model: "Izmena drugog člana",
          },
        })
      ).error,
    ).toBeNull();
    const component = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Unutrašnja jedinica · Fiktivna jedinica",
          exact: true,
        }),
      });
    await component
      .locator("summary")
      .filter({ hasText: "Uredi komponentu" })
      .click();
    const unitForm = component.getByRole("form", {
      name: "Podaci komponente",
      exact: true,
    });
    await unitForm
      .getByLabel("Serijski broj", { exact: true })
      .fill("M5A-SERIAL");
    await unitForm
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(unitForm.getByRole("status")).toBeVisible();
    await expect(edit.getByLabel("Model", { exact: true })).toHaveValue(
      "Lokalna nesnimljena izmena",
    );
    await expect(edit.locator('input[name="version"]')).toHaveValue("1");
    await expect(edit.locator('input[name="operationId"]')).toHaveValue(
      operation,
    );
    await edit
      .getByRole("button", { name: "Sačuvaj izmene", exact: true })
      .click();
    await expect(edit.getByRole("alert")).toContainText("Podaci su promenjeni");
    await expect(edit.getByLabel("Model", { exact: true })).toHaveValue(
      "Lokalna nesnimljena izmena",
    );
    expect(
      (
        await fixture.db.query("select model from public.systems where id=$1", [
          sys,
        ])
      ).rows[0].model,
    ).toBe("Izmena drugog člana");
  } finally {
    await cleanRegister(fixture);
    await fixture.dispose();
  }
});
