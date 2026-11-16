import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
  "base64",
);
test("private photos persist, verify once and respect customer visibility and withdrawn access", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const org = "a1000000-0000-4000-8000-000000000001";
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const [customer, site, system, visit] = ids;
  const otherContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  const office = await otherContext.newPage();
  const uploadedIds: string[] = [];
  async function login(p: Page, email: string) {
    await p.goto("/sign-in");
    await p.getByLabel("Email adresa").fill(email);
    await p
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await p.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(p).toHaveURL(/\/(office|today)$/);
  }
  async function create(id: string, kind: string, data: unknown) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true)",
      );
      await db.query("select public.save_operation($1,$2,$3,$4::jsonb)", [
        org,
        id,
        kind,
        JSON.stringify(data),
      ]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
  const panel = () =>
    page.getByRole("region", { name: "Fotografije KL-01", exact: true });
  const post = (kind: string, data: unknown) =>
    page.request.post(`/api/field/attachments/${kind}`, {
      data,
      headers: {
        origin:
          info.project.use.baseURL ||
          process.env.PLAYWRIGHT_BASE_URL ||
          "http://localhost:3000",
      },
    });
  try {
    const m = await db.query(
      "select id from public.memberships where organization_id=$1 and user_id='a1000000-0000-4000-8000-000000000102' and active",
      [org],
    );
    await create(customer, "customer", { name: "Fictional evidence" });
    await create(site, "site", {
      customerId: customer,
      code: site,
      name: "Foto provera",
      address: "Primer 14",
      timeZone: "Europe/Belgrade",
    });
    await create(system, "system", {
      siteId: site,
      code: "KL-01",
      room: "Provera",
    });
    await create(visit, "visit", {
      siteId: site,
      visitType: "maintenance",
      start: "2026-11-16T09:00",
      end: "2026-11-16T10:00",
      systems: [system],
      members: [m.rows[0].id],
    });
    await login(page, "technician.a@hvac.example.invalid");
    await page.goto(`/visits/${visit}`);
    await panel()
      .getByLabel("Izaberite fotografiju", { exact: true })
      .setInputFiles({
        name: "wrong.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("fictional"),
      });
    await panel()
      .getByRole("button", { name: "Dodaj fotografiju", exact: true })
      .click();
    await expect(panel().getByRole("status")).toContainText(
      "JPEG, PNG ili WebP",
    );
    const pendingId = randomUUID();
    uploadedIds.push(pendingId);
    const reservation = {
      visitId: visit,
      attachmentId: pendingId,
      itemId: (
        await db.query("select id from public.visit_items where visit_id=$1", [
          visit,
        ])
      ).rows[0].id,
      caption: "Nepotvrđena fotografija",
      visibility: "customer",
      bytes: png.length,
      mimeType: "image/png",
    };
    expect((await post("prepare", reservation)).status()).toBe(200);
    expect((await post("prepare", reservation)).status()).toBe(200);
    expect(
      (
        await post("complete", { visitId: visit, attachmentId: pendingId })
      ).status(),
    ).toBe(503);
    await login(office, "owner.a@hvac.example.invalid");
    await office.goto(`/visits/${visit}/preview`);
    await expect(office.getByRole("article")).not.toContainText(
      "Nepotvrđena fotografija",
    );
    await page.reload();
    for (const [caption, visibility] of [
      ["Spoljašnji izgled", "customer"],
      ["Interna fotografija", "internal"],
    ]) {
      await panel()
        .getByLabel("Izaberite fotografiju", { exact: true })
        .setInputFiles({
          name: "fictional.png",
          mimeType: "image/png",
          buffer: png,
        });
      await panel()
        .getByLabel("Opis fotografije", { exact: true })
        .fill(caption);
      await panel()
        .getByLabel("Vidljivost fotografije", { exact: true })
        .selectOption(visibility);
      await panel()
        .getByRole("button", { name: "Dodaj fotografiju", exact: true })
        .click();
      await expect(
        panel().getByRole("img", { name: caption, exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          panel()
            .getByRole("img", { name: caption, exact: true })
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBe(1);
    }
    const rows = await db.query(
      "select id from public.attachments where visit_id=$1 and state='verified' order by created_at",
      [visit],
    );
    uploadedIds.push(...rows.rows.map((r) => r.id));
    expect(rows.rows).toHaveLength(2);
    const customerId = rows.rows[0].id,
      internalId = rows.rows[1].id;
    const unsigned = await fetch(`https://res.cloudinary.com/${process.env.CLOUDINARY_NAME}/image/authenticated/hvac/${org}/${customerId}.png`);
    expect(unsigned.ok).toBe(false);
    expect(
      (
        await post("complete", { visitId: visit, attachmentId: customerId })
      ).status(),
    ).toBe(200);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.attachments where id=$1",
          [customerId],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.reload();
    await expect(
      panel().getByRole("img", { name: "Spoljašnji izgled", exact: true }),
    ).toBeVisible();
    const content = `/api/field/attachments/${customerId}?visitId=${visit}`;
    const image = await page.request.get(content);
    expect(image.status()).toBe(200);
    expect(image.headers()["cache-control"]).toContain("no-store");
    await office.reload();
    const report = office.getByRole("article");
    await expect(
      report.getByRole("img", { name: "Spoljašnji izgled", exact: true }),
    ).toBeVisible();
    await expect(report).not.toContainText("Interna fotografija");
    expect(
      (
        await office.request.get(
          `/api/field/attachments/${internalId}?visitId=${visit}&customer=1`,
        )
      ).status(),
    ).toBe(404);
    await office.screenshot({
      path: info.outputPath("evidence-preview.png"),
      fullPage: true,
    });
    expect(
      await office.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await otherContext.clearCookies();
    await login(office, "owner.b@hvac.example.invalid");
    expect((await office.request.get(content)).status()).toBe(404);
    await db.query("delete from public.visit_assignees where visit_id=$1", [
      visit,
    ]);
    expect((await page.request.get(content)).status()).toBe(404);
    expect((await post("prepare", reservation)).status()).toBe(404);
    await db.query(
      "insert into public.visit_assignees(organization_id,visit_id,membership_id) values($1,$2,$3)",
      [org, visit, m.rows[0].id],
    );
    expect(
      (
        await post("remove", { visitId: visit, attachmentId: customerId })
      ).status(),
    ).toBe(200);
    expect((await page.request.get(content)).status()).toBe(404);
  } finally {
    const found = await db.query(
      "select id from public.attachments where visit_id=$1",
      [visit],
    );
    uploadedIds.push(...found.rows.map((r) => r.id));
    const { v2: cloudinary } = await import("cloudinary");
    const cleanupOptions = {
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      type: "authenticated" as const,
      invalidate: true,
      timeout: 20000,
    };
    await Promise.allSettled(
      [...new Set(uploadedIds)].map((id) =>
        cloudinary.uploader.destroy(`hvac/${org}/${id}`, cleanupOptions),
      ),
    );
    await otherContext.close();
    await db.query("begin");
    await db.query("delete from public.attachments where visit_id=$1", [visit]);
    await db.query("delete from public.visit_items where visit_id=$1", [visit]);
    await db.query("delete from public.visit_assignees where visit_id=$1", [
      visit,
    ]);
    await db.query(
      "delete from hvac_private.operation_receipts where operation_id=any($1::uuid[])",
      [ids],
    );
    for (const table of ["visits", "systems", "sites", "customers"])
      await db.query(`delete from public.${table} where id=any($1::uuid[])`, [
        ids,
      ]);
    await db.query("commit");
    await db.end();
  }
});
