import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReportFixture } from "./report-fixture";
import type { FieldDraft } from "../features/offline/draft-model";
async function login(page: Page, email = "technician.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}
async function drafts(page: Page, visitId: string): Promise<FieldDraft[]> {
  return page.evaluate(async (id) => {
    const path = "/offline/v2/storage.js";
    const storage = await import(path);
    const identity = await storage.activeIdentity();
    return identity ? storage.listDrafts(identity, id) : [];
  }, visitId);
}
test("durable field drafts preserve raw inputs, reject failed writes, freeze queued payloads and isolate accounts", async ({
  baseURL,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture({ submitted: false });
  const profile = await mkdtemp(join(tmpdir(), "teren-drafts-"));
  const options = {
    baseURL,
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    viewport: info.project.use.viewport,
  };
  let context = await chromium.launchPersistentContext(profile, options);
  await context.route("**/api/field/sync", (route) => route.abort());
  try {
    let page = context.pages()[0] || (await context.newPage());
    await login(page);
    let card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    // Recreate the previously shipped v1 device schema, then exercise its non-destructive upgrade.
    await page.goto("/offline/v1/icon.svg");
    await page.evaluate(async () => {
      const open = (version: number) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("teren-field", version);
          request.onerror = () => reject(request.error);
          request.onupgradeneeded = () => {
            const db = request.result;
            const bundles = db.createObjectStore("bundles", {
              keyPath: ["userId", "organizationId", "visit.id"],
            });
            bundles.createIndex("partition", ["userId", "organizationId"]);
            db.createObjectStore("meta");
          };
          request.onsuccess = () => resolve(request.result);
        });
      const db = await open(4);
      const captured = await new Promise<{
        active: unknown;
        bundles: unknown[];
      }>((resolve) => {
        const tx = db.transaction(["meta", "bundles"], "readonly");
        const meta = tx.objectStore("meta").get("active"),
          bundles = tx.objectStore("bundles").getAll();
        tx.oncomplete = () =>
          resolve({ active: meta.result, bundles: bundles.result });
      });
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("teren-field");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      const legacy = await open(1);
      await new Promise<void>((resolve, reject) => {
        const tx = legacy.transaction(["meta", "bundles"], "readwrite");
        tx.objectStore("meta").put(captured.active, "active");
        captured.bundles.forEach((bundle) =>
          tx.objectStore("bundles").put(bundle),
        );
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      legacy.close();
    });
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    const editors = page.getByRole("region", { name: /^Unos / });
    await expect(editors).toHaveCount(4);
    const first = editors.nth(0),
      second = editors.nth(1);
    await first
      .getByLabel("Obavljeni radovi", { exact: true })
      .fill("Fictional offline work");
    await first.getByLabel("Ishod", { exact: true }).selectOption("pending");
    await first
      .getByRole("button", { name: "Dodaj materijal", exact: true })
      .click();
    await first
      .getByLabel("Naziv materijala", { exact: true })
      .fill("Fictional coolant");
    await first.getByLabel("Količina", { exact: true }).fill("0,50");
    await first
      .getByLabel("Vrsta radnje", { exact: true })
      .selectOption("revisit");
    await first
      .getByLabel("Odgovorni član tima", { exact: true })
      .selectOption("");
    await first.getByLabel("Rok radnje (GGGG-MM-DD)", { exact: true }).fill("");
    await second.getByLabel("Izmerena vrednost", { exact: true }).fill("0");
    await second
      .getByLabel("Stanje merenja", { exact: true })
      .nth(1)
      .selectOption("not_applicable");
    await second
      .getByLabel("Stanje merenja", { exact: true })
      .nth(1)
      .selectOption("not_measured");
    await second
      .getByLabel("Nalaz", { exact: true })
      .fill("Fictional second draft");
    await expect(first.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await expect(second.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    const before = await drafts(page, fixture.visitId);
    expect(before).toHaveLength(2);
    const initial = before.find(
      (d) => d.values.work === "Fictional offline work",
    )!;
    expect(initial.actorId).toBe(initial.userId);
    expect(initial.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(initial.baseItemVersion).toBeGreaterThan(0);
    expect(initial.values.followUp?.ownerId).toBe("");
    expect(initial.values.parts[0].quantity).toBe("0,50");
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.route("**/api/field/sync", (route) => route.abort());
    await context.setOffline(true);
    page = context.pages()[0] || (await context.newPage());
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect.poll(() => drafts(page, fixture.visitId)).toEqual(before);
    const restored = page.getByRole("region", { name: /^Unos / });
    const a = restored.nth(0),
      b = restored.nth(1);
    await expect(a.getByLabel("Ishod", { exact: true })).toHaveValue("pending");
    await expect(a.getByLabel("Količina", { exact: true })).toHaveValue("0,50");
    await expect(
      b.getByLabel("Izmerena vrednost", { exact: true }),
    ).toHaveValue("0");
    await expect(
      b.getByLabel("Stanje merenja", { exact: true }).nth(1),
    ).toHaveValue("not_measured");
    // A failed real IndexedDB write must retain the prior committed record and never claim success.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "drafts") {
          IDBObjectStore.prototype.put = original;
          throw new DOMException(
            "Fictional quota failure",
            "QuotaExceededError",
          );
        }
        return original.call(this, value, key);
      };
    });
    await a
      .getByLabel("Obavljeni radovi", { exact: true })
      .fill("Retry retained input");
    await expect(a.getByRole("status")).toHaveText(
      "Postoje nesačuvane izmene.",
    );
    expect(await drafts(page, fixture.visitId)).toEqual(before);
    await a
      .getByRole("button", { name: "Ponovi čuvanje", exact: true })
      .click();
    await expect(a.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await a
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await expect(a.getByRole("status")).toHaveText(
      "Čeka slanje · nije potvrđeno na serveru.",
    );
    await expect(
      a.getByLabel("Obavljeni radovi", { exact: true }),
    ).toBeDisabled();
    const queued = (await drafts(page, fixture.visitId)).find(
      (d) => d.itemId === initial.itemId,
    )!;
    expect(queued.operationId).toBe(initial.operationId);
    expect(queued.payload?.parts[0].quantity).toBe(0.5);
    expect(queued.payload?.followUp?.ownerId).toBe("");
    expect(queued.payload?.outcome).toBe("pending");
    const other = (await drafts(page, fixture.visitId)).find(
      (d) => d.itemId !== initial.itemId,
    )!;
    expect(other.values.readings.map((r) => r.value)).toEqual(["0", null]);
    await expect(
      page.getByRole("button", { name: /Predaj sažetak/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("durable-offline-drafts.png"),
      fullPage: true,
    });
    await context.setOffline(false);
    await page.goto(`/visits/${fixture.visitId}`);
    await expect(
      page.getByText(/Na telefonu postoje neposlate izmene/),
    ).toBeVisible();
    await page.goto("/today");
    card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    await expect(card.getByRole("alert")).toContainText("neposlate nacrte");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page, "owner.b@hvac.example.invalid");
    await page.goto("/today");
    await expect(
      page.getByText("Nalog i radni prostor su potvrđeni za ovaj telefon.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await drafts(page, fixture.visitId)).toEqual([]);
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page);
    await page.goto("/today");
    await expect
      .poll(async () => (await drafts(page, fixture.visitId)).length)
      .toBe(2);
    expect(
      (await drafts(page, fixture.visitId)).find(
        (d) => d.itemId === initial.itemId,
      ),
    ).toMatchObject({
      operationId: queued.operationId,
      payload: queued.payload,
      values: queued.values,
      actorId: queued.actorId,
      baseItemVersion: queued.baseItemVersion,
    });
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    const oldRevision = (await drafts(page, fixture.visitId)).find(
      (d) => d.itemId === other.itemId,
    )!;
    const competing = await context.newPage();
    await competing.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    const competingEditor = competing
      .getByRole("region", { name: /^Unos / })
      .nth(1);
    await competingEditor
      .getByLabel("Nalaz", { exact: true })
      .fill("Second tab preserved");
    await expect(competingEditor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await expect(
      page
        .getByRole("region", { name: /^Unos / })
        .nth(1)
        .getByRole("alert"),
    ).toContainText("Drugi prozor");
    const conflict = await page.evaluate(
      async ({ visitId, old }) => {
        const path = "/offline/v2/storage.js";
        const storage = await import(path);
        try {
          await storage.saveDraft(
            await storage.activeIdentity(),
            visitId,
            old.itemId,
            old.values,
            old.revision,
          );
          return "overwritten";
        } catch (error) {
          return (error as Error).message;
        }
      },
      { visitId: fixture.visitId, old: oldRevision },
    );
    expect(conflict).toBe("stale_draft");
    expect(
      (await drafts(page, fixture.visitId)).find(
        (d) => d.itemId === other.itemId,
      )?.values.finding,
    ).toBe("Second tab preserved");
    await competing.close();
    const row = (
      await fixture.db.query("select status from public.visits where id=$1", [
        fixture.visitId,
      ])
    ).rows[0];
    expect(row.status).toBe("in_progress");
  } finally {
    await context.close();
    await fixture.dispose();
    await rm(profile, { recursive: true, force: true });
  }
});
