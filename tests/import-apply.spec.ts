import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
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
async function login(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL("/office");
}
async function upload(page: Page, buffer: Buffer, batches: string[]) {
  await page.goto("/imports");
  await page
    .getByLabel("CSV ili XLSX fajl")
    .setInputFiles({ name: "fiktivni-uvoz.csv", mimeType: "text/csv", buffer });
  await page.getByRole("button", { name: "Učitaj za pregled" }).click();
  await expect(page).toHaveURL(/\/imports\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  batches.push(id);
  await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
  await expect(
    page.getByRole("heading", { name: "Rezultat pregleda" }),
  ).toBeVisible();
  return id;
}
async function cleanup(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
  batches: string[],
) {
  for (const table of [
    "import_apply_receipts",
    "import_applications",
    "import_previews",
  ])
    await fixture.db.query(
      `delete from hvac_private.${table} where organization_id=$1 and batch_id=any($2::uuid[])`,
      [fixture.org, batches],
    );
  await fixture.db.query(
    "delete from hvac_private.import_batches where organization_id=$1 and id=any($2::uuid[])",
    [fixture.org, batches],
  );
  await fixture.db.query(
    "delete from hvac_private.register_events where organization_id=$1 and entity_id=any($2::uuid[])",
    [fixture.org, fixture.systemIds],
  );
  await fixture.db.query(
    "delete from public.systems where site_id=$1 and not(id=any($2::uuid[]))",
    [fixture.siteId, fixture.systemIds],
  );
  await fixture.dispose();
}
test("reviewed import survives a lost response, preserves issued history and reimports without duplicate systems", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const fixture = await createReportFixture();
  const batches: string[] = [];
  let worker: Awaited<ReturnType<typeof workerClient>> | undefined;
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
    const revision = issued.data as string;
    worker = await workerClient();
    const job = await claimJob(worker, revision);
    expect(job).not.toBeNull();
    await processJob(worker, job!);
    const frozen = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: revision,
    });
    expect(frozen.error).toBeNull();
    const original = await owner.storage
      .from("report-pdfs")
      .download(frozen.data.artifact.path);
    expect(original.error).toBeNull();
    const digest = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    const pdfHash = digest(Buffer.from(await original.data!.arrayBuffer()));
    const systems = (
      await fixture.db.query(
        "select * from public.systems where site_id=$1 order by code",
        [fixture.siteId],
      )
    ).rows;
    const findings = (
      await fixture.db.query(
        "select to_jsonb(i) data from public.visit_items i where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    const site = fixture.siteId.slice(0, 8).toUpperCase();
    const csv = Buffer.from(
      `siteCode;systemCode;room;serial\n${site};KL-01;Nova prostorija;00099\n${site};KL-02;${systems[1].room};${systems[1].serial}\n${site};TEST-NOVI;Šuma;00123\n`,
    );
    await login(page);
    const batch = await upload(page, csv, batches);
    const form = page.getByRole("form", { name: "Potvrda uvoza" });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "Potvrdi i primeni uvoz" }).click();
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.import_applications where organization_id=$1 and batch_id=$2",
          [fixture.org, batch],
        )
      ).rows[0].n,
    ).toBe(0);
    await form
      .getByRole("checkbox", {
        name: "Potvrđujem pregledane podatke i upis u registar.",
      })
      .check();
    const operation = await form
      .locator("input[name=operationId]")
      .inputValue();
    let responseLost = false;
    await page.route(`**/imports/${batch}`, async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        responseLost = true;
        await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Potvrdi i primeni uvoz" }).click();
    await expect.poll(() => responseLost).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              "select count(*)::int n from hvac_private.import_applications where organization_id=$1 and batch_id=$2",
              [fixture.org, batch],
            )
          ).rows[0].n,
      )
      .toBe(1);
    await page.unroute(`**/imports/${batch}`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uvoz je primenjen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Rezultat primene" }),
    ).toContainText("Kreirano: 1 · Ažurirano: 1 · Preskočeno: 1");
    await expect(
      page.getByRole("button", { name: "Potvrdi i primeni uvoz" }),
    ).toHaveCount(0);
    const detail = await owner.rpc("import_detail", {
      ...scoped,
      p_batch_id: batch,
    });
    expect(detail.error).toBeNull();
    const preview = detail.data.preview;
    const result = detail.data.application;
    const replay = await owner.rpc("import_apply", {
      ...scoped,
      p_batch_id: batch,
      p_preview_id: preview.id,
      p_digest: preview.digest,
      p_operation_id: operation,
      p_confirmed: true,
    });
    expect(replay.error).toBeNull();
    expect(replay.data.rows).toEqual(result.rows);
    expect(replay.data.created).toBe(1);
    const current = (
      await fixture.db.query(
        "select * from public.systems where site_id=$1 order by code",
        [fixture.siteId],
      )
    ).rows;
    expect(current).toHaveLength(5);
    const changed = current.find((row) => row.id === systems[0].id);
    expect(changed.room).toBe("Nova prostorija");
    expect(changed.serial).toBe("00099");
    expect(changed.model).toBe(systems[0].model);
    expect(changed.version).toBe(systems[0].version + 1);
    expect(current.find((row) => row.id === systems[1].id).version).toBe(
      systems[1].version,
    );
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
        await owner.rpc("report_revision", {
          ...scoped,
          p_revision_id: revision,
        })
      ).data,
    ).toEqual(frozen.data);
    const afterPdf = await owner.storage
      .from("report-pdfs")
      .download(frozen.data.artifact.path);
    expect(afterPdf.error).toBeNull();
    expect(digest(Buffer.from(await afterPdf.data!.arrayBuffer()))).toBe(
      pdfHash,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("applied-import.png"),
      fullPage: true,
    });
    const newLink = page
      .getByRole("region", { name: "Rezultat primene" })
      .getByRole("link", { name: "TEST-NOVI", exact: true });
    await newLink.click();
    await expect(
      page.getByRole("heading", { name: /TEST-NOVI/ }).first(),
    ).toBeVisible();
    await upload(page, csv, batches);
    await page
      .getByRole("checkbox", {
        name: "Potvrđujem pregledane podatke i upis u registar.",
      })
      .check();
    await page.getByRole("button", { name: "Potvrdi i primeni uvoz" }).click();
    await expect(
      page.getByRole("region", { name: "Rezultat primene" }),
    ).toContainText("Kreirano: 0 · Ažurirano: 0 · Preskočeno: 3");
    expect(
      (
        await fixture.db.query(
          "select * from public.systems where site_id=$1 order by code",
          [fixture.siteId],
        )
      ).rows,
    ).toEqual(current);
  } finally {
    worker?.auth.stopAutoRefresh();
    await cleanup(fixture, batches);
  }
});
test("stale review changes nothing, refreshed confirmation serializes and denies other tenants and field accounts", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture({ submitted: false });
  const batches: string[] = [];
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const site = fixture.siteId.slice(0, 8).toUpperCase();
    await login(page);
    const batch = await upload(
      page,
      Buffer.from(
        `siteCode,systemCode,room\n${site},KL-01,Predložena soba\n${site},TEST-ATOMIC,Novi sistem\n`,
      ),
      batches,
    );
    const system = (
      await fixture.db.query("select * from public.systems where id=$1", [
        fixture.systemIds[0],
      ])
    ).rows[0];
    expect(
      (
        await owner.rpc("register_command", {
          ...scoped,
          p_entity_id: system.id,
          p_operation_id: randomUUID(),
          p_kind: "system.update",
          p_version: system.version,
          p_data: {
            code: system.code,
            room: "Promenjeno posle pregleda",
            model: system.model,
            serial: system.serial,
            manufacturer: system.manufacturer,
            systemType: system.system_type,
          },
        })
      ).error,
    ).toBeNull();
    await page
      .getByRole("checkbox", {
        name: "Potvrđujem pregledane podatke i upis u registar.",
      })
      .check();
    await page.getByRole("button", { name: "Potvrdi i primeni uvoz" }).click();
    await expect(
      page.getByRole("form", { name: "Potvrda uvoza" }),
    ).toContainText("Pregled ili podaci u registru su promenjeni");
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from public.systems where site_id=$1",
          [fixture.siteId],
        )
      ).rows[0].n,
    ).toBe(4);
    expect(
      (
        await fixture.db.query("select room from public.systems where id=$1", [
          system.id,
        ])
      ).rows[0].room,
    ).toBe("Promenjeno posle pregleda");
    await page.screenshot({
      path: info.outputPath("stale-import.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Pregledaj mapiranje" }).click();
    await expect(
      page.getByRole("checkbox", {
        name: "Potvrđujem pregledane podatke i upis u registar.",
      }),
    ).not.toBeChecked();
    const detail = await owner.rpc("import_detail", {
      ...scoped,
      p_batch_id: batch,
    });
    expect(detail.error).toBeNull();
    const p = detail.data.preview;
    const input = {
      ...scoped,
      p_batch_id: batch,
      p_preview_id: p.id,
      p_digest: p.digest,
      p_confirmed: true,
    };
    const concurrent = await Promise.all([
      owner.rpc("import_apply", { ...input, p_operation_id: randomUUID() }),
      owner.rpc("import_apply", { ...input, p_operation_id: randomUUID() }),
    ]);
    expect(concurrent.map((x) => x.error)).toEqual([null, null]);
    expect(concurrent[0].data).toEqual(concurrent[1].data);
    expect(concurrent[0].data.created).toBe(1);
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const outsider = await api(email);
      expect(
        (
          await outsider.rpc("import_apply", {
            ...input,
            p_operation_id: randomUUID(),
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (await outsider.rpc("import_detail", { ...scoped, p_batch_id: batch }))
          .error?.code,
      ).toBe("42501");
    }
    expect(
      (
        await owner.rpc("import_apply", {
          ...input,
          p_digest: "f".repeat(64),
          p_operation_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uvoz je primenjen" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await cleanup(fixture, batches);
  }
});
