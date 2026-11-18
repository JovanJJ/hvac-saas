import {
  test,
  expect,
  chromium,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { cloudinarySettings } from "../lib/cloudinary-settings";
import { createReportFixture } from "./report-fixture";
async function login(page: Page, email = "technician.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}
async function stored(page: Page, visitId: string) {
  return page.evaluate(async (visitId) => {
    const path = "/offline/v2/storage.js",
      storage = await import(path);
    const identity = await storage.activeIdentity();
    if (!identity) return [];
    // Inspect the real device store without copying image bytes into test output.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("teren-field");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      const photos = await new Promise<
        {
          id: string;
          caption: string;
          visibility: string;
          bytes: number;
          blob: Blob | null;
          state: string;
          effects: object;
          action: string;
          attemptedAt: string | null;
        }[]
      >((resolve, reject) => {
        const tx = db.transaction("photos", "readonly"),
          r = tx
            .objectStore("photos")
            .index("visit")
            .getAll([identity.userId, identity.organizationId, visitId]);
        tx.oncomplete = () => resolve(r.result);
        tx.onabort = () => reject(tx.error);
      });
      return await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          caption: p.caption,
          visibility: p.visibility,
          bytes: p.bytes,
          state: p.state,
          action: p.action,
          effects: p.effects,
          attemptedAt: p.attemptedAt,
          hash: p.blob
            ? Array.from(
                new Uint8Array(
                  await crypto.subtle.digest(
                    "SHA-256",
                    await p.blob.arrayBuffer(),
                  ),
                ),
              )
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")
            : null,
        })),
      );
    } finally {
      db.close();
    }
  }, visitId);
}
async function cleanup(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  try {
    const rows = (
      await fixture.db.query(
        "select 'hvac/'||organization_id||'/'||id as public_id from public.attachments where organization_id=$1 and visit_id=$2",
        [fixture.org, fixture.visitId],
      )
    ).rows;
    for (const row of rows)
      await cloudinary.uploader.destroy(row.public_id, {
        ...cloudinarySettings(process.env),
        type: "authenticated",
        resource_type: "image",
        invalidate: true,
      });
  } finally {
    await fixture.dispose();
  }
}
async function capture(
  page: Page,
  code: string,
  bytes: Buffer,
  caption: string,
  visibility = "customer",
  mimeType = "image/png",
) {
  const panel = page.getByRole("region", {
    name: `Fotografije na telefonu ${code}`,
    exact: true,
  });
  await panel
    .getByLabel("Izaberite fotografiju", { exact: true })
    .setInputFiles({ name: "fictional-photo.png", mimeType, buffer: bytes });
  await panel.getByLabel("Opis fotografije", { exact: true }).fill(caption);
  await panel
    .getByLabel("Vidljivost fotografije", { exact: true })
    .selectOption(visibility);
  await panel
    .getByRole("button", {
      name: "Sačuvaj fotografiju na telefonu",
      exact: true,
    })
    .click();
  return panel;
}
test("offline photo blobs survive restart, lost verification replays once and submission waits for verified evidence", async ({
  baseURL,
}, info) => {
  test.setTimeout(240000);
  const fixture = await createReportFixture({ submitted: false });
  const bytes = await sharp({
    create: { width: 160, height: 100, channels: 3, background: "#165d4c" },
  })
    .png()
    .toBuffer();
  const profile = await mkdtemp(join(tmpdir(), "teren-photos-"));
  const options = {
    baseURL,
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    viewport: info.project.use.viewport,
  };
  let context = await chromium.launchPersistentContext(profile, options);
  let lost = false;
  const uploads: string[] = [];
  async function intercept(ctx: BrowserContext) {
    await ctx.route("**/api/field/offline-photos/**", async (route) => {
      const kind = new URL(route.request().url()).pathname.split("/").at(-1);
      if (kind === "upload") uploads.push("upload");
      const response = await route.fetch();
      if (kind === "complete" && response.status() === 200 && !lost) {
        lost = true;
        await route.abort();
      } else await route.fulfill({ response });
    });
  }
  try {
    await intercept(context);
    let page = context.pages()[0] || (await context.newPage());
    await login(page);
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await capture(page, "KL-01", bytes, "Fiktivan čist filter");
    await capture(
      page,
      "KL-02",
      bytes,
      "Fiktivna interna fotografija",
      "internal",
    );
    await expect
      .poll(async () => (await stored(page, fixture.visitId)).length)
      .toBe(2);
    const before = await stored(page, fixture.visitId);
    expect(before.every((p) => p.hash && p.attemptedAt === null)).toBe(true);
    const previews = page.getByRole("img");
    await expect(previews).toHaveCount(2);
    await expect
      .poll(() =>
        previews.first().evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(160);
    await page
      .getByRole("button", {
        name: "Pripremi predaju kancelariji",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Predaja posete", exact: true })
        .getByRole("status"),
    ).toContainText("Predaja čeka slanje");
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await intercept(context);
    await context.setOffline(true);
    page = context.pages()[0] || (await context.newPage());
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect.poll(() => stored(page, fixture.visitId)).toEqual(before);
    await page.screenshot({
      path: info.outputPath("restored-photo-outbox.png"),
      fullPage: true,
    });
    await context.setOffline(false);
    await expect.poll(() => lost, { timeout: 90000 }).toBe(true);
    const sync = page.getByRole("region", {
      name: "Sinhronizacija",
      exact: true,
    });
    await expect(sync.getByRole("status")).toContainText("Fajl je zadržan", {
      timeout: 20000,
    });
    const uncertain = await stored(page, fixture.visitId);
    expect(uncertain[0].hash).toBe(before[0].hash);
    expect(
      (
        await fixture.db.query("select status from public.visits where id=$1", [
          fixture.visitId,
        ])
      ).rows[0].status,
    ).toBe("in_progress");
    await sync
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              "select status from public.visits where id=$1",
              [fixture.visitId],
            )
          ).rows[0].status,
        { timeout: 90000 },
      )
      .toBe("submitted");
    await expect
      .poll(
        async () =>
          (await stored(page, fixture.visitId)).every(
            (p) => p.state === "verified",
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    expect(uploads).toHaveLength(2);
    expect(
      (await stored(page, fixture.visitId)).map((p) => p.id).sort(),
    ).toEqual(before.map((p) => p.id).sort());
    const rows = (
      await fixture.db.query(
        "select id,visibility,state,author_id from public.attachments where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (p) =>
          p.state === "verified" &&
          p.author_id === "a1000000-0000-4000-8000-000000000102",
      ),
    ).toBe(true);
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 5);
    await expect(page.getByRole("definition")).toHaveText(["4", "3", "2"]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("confirmed-offline-photos.png"),
      fullPage: true,
    });
    const internal = rows.find((p) => p.visibility === "internal"),
      customer = rows.find((p) => p.visibility === "customer");
    expect(
      (
        await page.request.get(
          `/api/field/attachments/${internal.id}?visitId=${fixture.visitId}&customer=1`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(
          `/api/field/attachments/${customer.id}?visitId=${fixture.visitId}`,
        )
      ).status(),
    ).toBe(200);
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page, "owner.a@hvac.example.invalid");
    await page.goto(`/visits/${fixture.visitId}/review`);
    await expect(page.getByAltText("Fiktivan čist filter")).toBeVisible();
    await page.goto(`/visits/${fixture.visitId}/preview`);
    await expect(page.getByAltText("Fiktivan čist filter")).toBeVisible();
    await expect(page.getByAltText("Fiktivna interna fotografija")).toHaveCount(
      0,
    );
  } finally {
    await context.close();
    await cleanup(fixture);
    await rm(profile, { recursive: true, force: true });
  }
});
test("failed photo writes retain the chosen file; invalid verified format retains its blob and blocks handover until explicit removal", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture({ submitted: false });
  const bytes = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#eef2ef" },
  })
    .png()
    .toBuffer();
  try {
    await login(page);
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, key) {
        if (this.name === "photos") {
          IDBObjectStore.prototype.add = original;
          throw new DOMException(
            "Fictional quota failure",
            "QuotaExceededError",
          );
        }
        return original.call(this, value, key);
      };
    });
    const panel = await capture(
      page,
      "KL-01",
      bytes,
      "Fiktivan neispravan format",
      "customer",
      "image/jpeg",
    );
    await expect(panel.getByRole("status")).toContainText(
      "Fotografija nije sačuvana",
    );
    expect(await stored(page, fixture.visitId)).toEqual([]);
    await expect(
      panel.getByLabel("Opis fotografije", { exact: true }),
    ).toHaveValue("Fiktivan neispravan format");
    await panel
      .getByRole("button", {
        name: "Sačuvaj fotografiju na telefonu",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await stored(page, fixture.visitId)).length)
      .toBe(1);
    const before = await stored(page, fixture.visitId);
    await page
      .getByRole("button", {
        name: "Pripremi predaju kancelariji",
        exact: true,
      })
      .click();
    await context.setOffline(false);
    await expect(panel.getByRole("alert")).toContainText(
      "Server nije prihvatio format",
      { timeout: 90000 },
    );
    expect((await stored(page, fixture.visitId))[0].hash).toBe(before[0].hash);
    expect(
      (
        await fixture.db.query("select status from public.visits where id=$1", [
          fixture.visitId,
        ])
      ).rows[0].status,
    ).toBe("in_progress");
    await page.screenshot({
      path: info.outputPath("retained-invalid-photo.png"),
      fullPage: true,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await panel
      .getByRole("button", {
        name: "Ukloni neposlatu fotografiju",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              "select status from public.visits where id=$1",
              [fixture.visitId],
            )
          ).rows[0].status,
        { timeout: 90000 },
      )
      .toBe("submitted");
    const removed = (await stored(page, fixture.visitId))[0];
    expect(removed.state).toBe("removed");
    expect(removed.hash).toBeNull();
    expect(
      (
        await fixture.db.query(
          "select state from public.attachments where id=$1",
          [removed.id],
        )
      ).rows[0].state,
    ).toBe("removed");
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 3);
  } finally {
    await context.setOffline(false);
    await cleanup(fixture);
  }
});
