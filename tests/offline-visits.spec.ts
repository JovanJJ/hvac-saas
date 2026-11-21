import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { createVerificationFixture } from "./auth-fixtures";
async function login(
  page: Page,
  email: string,
  password = process.env.SEED_PASSWORD!,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}
async function localBundles(page: Page) {
  return page.evaluate(async () => {
    const path = "/offline/v1/storage.js";
    const storage = await import(path);
    const identity = await storage.activeIdentity();
    return identity ? await storage.listBundles(identity) : [];
  });
}
test("download survives a full browser restart offline; missing visits, removal and quota failures are explicit", async ({
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture(),
    missing = await createReportFixture();
  const profile = await mkdtemp(join(tmpdir(), "teren-offline-"));
  const options = {
    baseURL,
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    viewport: info.project.use.viewport,
    locale: "sr-Latn-RS",
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0] || (await context.newPage());
    await login(page, "technician.a@hvac.example.invalid");
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · samo pregled", { exact: true }),
    ).toBeVisible();
    const initial = (await localBundles(page)).find(
      (b: { visit: { id: string } }) => b.visit.id === fixture.visitId,
    );
    expect(initial.schemaVersion).toBe(1);
    expect(initial.visit.availableSystems).toBeUndefined();
    expect(initial.visit.items[1].readings[0].private).toBeUndefined();
    expect(initial.visit.items[1].readings[0].value).toBe(0);
    const cache = await page.evaluate(async () => {
      const result = [];
      for (const name of await caches.keys()) {
        const store = await caches.open(name);
        for (const key of await store.keys())
          result.push({
            name,
            path: new URL(key.url).pathname,
            body: await (await store.match(key))!.text(),
          });
      }
      return result;
    });
    expect(cache).toHaveLength(9);
    for (const entry of cache) {
      expect(entry.name).toMatch(/^teren-shell-v2-[a-f0-9]{12}$/);
      expect(entry.path).toMatch(/^\/offline\/v[12]\//);
      expect(entry.body).not.toContain(fixture.siteName);
      expect(entry.body).not.toContain("SECRET-INTERNAL");
    }
    // Close the browser process, reopen the same device profile, then disable its connection before navigation.
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    page = context.pages()[0] || (await context.newPage());
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Preuzete posete",
    );
    await expect(
      page.getByText("Nalog: technician.a@hvac.example.invalid", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: fixture.siteName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(missing.siteName, { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "Otvori preuzetu posetu" }).click();
    await expect(page.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(
      page.getByText("Struja: 0 A · Hlađenje", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Zaključana arhiva", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sačuvaj|Predaj/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("offline-visit.png"),
      fullPage: true,
    });
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await page.goto(`/visits/${missing.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    await expect(
      page.getByText(/Nema preuzetih poseta za ovaj nalog/),
    ).toBeVisible();
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await page.goto("/today");
    // Real IndexedDB transaction path, with a forced quota error on the bundle write.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "bundles")
          throw new DOMException(
            "Fictional quota failure",
            "QuotaExceededError",
          );
        return original.call(this, value, key);
      };
    });
    const again = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await again
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(again.getByRole("alert")).toContainText(
      "Preuzimanje nije uspelo",
    );
    await expect(
      again.getByText("Dostupno bez veze · samo pregled", { exact: true }),
    ).toHaveCount(0);
    expect(await localBundles(page)).toHaveLength(0);
    await page.reload();
    await again
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      again.getByText("Dostupno bez veze · samo pregled", { exact: true }),
    ).toBeVisible();
    const retained = (await localBundles(page))[0];
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "bundles") {
          IDBObjectStore.prototype.put = original;
          throw new DOMException(
            "Fictional refresh failure",
            "QuotaExceededError",
          );
        }
        return original.call(this, value, key);
      };
    });
    await again
      .getByRole("button", { name: "Preuzmi ponovo", exact: true })
      .click();
    await expect(again.getByRole("alert")).toContainText(
      "Preuzimanje nije uspelo",
    );
    expect((await localBundles(page))[0]).toEqual(retained);
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (key) {
        if (this.name === "bundles")
          throw new DOMException("Fictional removal failure", "UnknownError");
        return original.call(this, key);
      };
    });
    await again
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Memorija nije dostupna",
    );
    expect(await localBundles(page)).toHaveLength(1);
  } finally {
    await context.close();
    await fixture.dispose();
    await missing.dispose();
    await rm(profile, { recursive: true, force: true });
  }
});
test("workspace and account changes isolate downloaded data; denied and withdrawn assignments cannot be retained", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120000);
  const identity = await createVerificationFixture();
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(
    "update auth.users set email_confirmed_at=now() where id=$1",
    [identity.id],
  );
  await admin.end();
  expect(
    (
      await api.auth.signInWithPassword({
        email: identity.email,
        password: identity.password,
      })
    ).error,
  ).toBeNull();
  const orgNameA = "Offline A " + identity.id.slice(0, 8),
    orgNameB = "Offline B " + identity.id.slice(0, 8);
  async function workspace(name: string) {
    const result = await api.rpc("create_workspace", {
      p_operation_id: randomUUID(),
      p_name: name,
      p_time_zone: "Europe/Belgrade",
    });
    expect(result.error).toBeNull();
    return result.data as string;
  }
  const orgA = await workspace(orgNameA),
    orgB = await workspace(orgNameB);
  const fixture = await createReportFixture({
    submitted: false,
    organizationId: orgA,
    ownerId: identity.id,
    technicianId: identity.id,
  });
  const unassigned = await createReportFixture({
    organizationId: orgA,
    ownerId: identity.id,
    technicianId: identity.id,
  });
  const membershipA = (
    await fixture.db.query(
      "select id from public.memberships where organization_id=$1 and user_id=$2",
      [orgA, identity.id],
    )
  ).rows[0].id as string;
  await context.route("**/api/field/offline-photos/**", (route) =>
    route.abort(),
  );
  const oldTab = await context.newPage();
  try {
    await fixture.db.query(
      "delete from public.visit_assignees where organization_id=$1 and visit_id=$2",
      [orgA, unassigned.visitId],
    );
    await login(page, identity.email, identity.password);
    await page.goto("/today");
    const denied = await page.request.get(
      `/api/field/visits/${unassigned.visitId}`,
    );
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(unassigned.siteName);
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
    });
    await card
      .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
      .click();
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    await oldTab.goto(`/offline/v1/index.html?visit=${fixture.visitId}`);
    await expect(
      oldTab.getByRole("heading", { name: fixture.siteName, exact: true }),
    ).toBeVisible();
    const editor = oldTab.getByRole("region", { name: /^Unos / }).first();
    await editor.getByLabel("Nalaz", { exact: true }).fill("Workspace A draft");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    const photoPanel = oldTab.getByRole("region", {
      name: "Fotografije na telefonu KL-01",
      exact: true,
    });
    await photoPanel
      .getByLabel("Izaberite fotografiju", { exact: true })
      .setInputFiles({
        name: "fictional.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await photoPanel
      .getByLabel("Opis fotografije", { exact: true })
      .fill("Workspace A private blob");
    await photoPanel
      .getByLabel("Vidljivost fotografije", { exact: true })
      .selectOption("internal");
    await photoPanel
      .getByRole("button", {
        name: "Sačuvaj fotografiju na telefonu",
        exact: true,
      })
      .click();
    await expect(
      oldTab.getByRole("img", {
        name: "Workspace A private blob",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Radni prostor", exact: true })
      .selectOption(orgB);
    await page
      .getByRole("button", { name: "Otvori radni prostor", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Zadrži na uređaju i nastavi", exact: true })
      .click();
    await expect(page.getByText(orgNameB, { exact: true })).toBeVisible();
    await expect(
      oldTab.getByText(fixture.siteName, { exact: true }),
    ).toHaveCount(0);
    expect(
      (await page.request.get(`/api/field/visits/${fixture.visitId}`)).status(),
    ).toBe(404);
    await page.goto(`/offline/v1/index.html?visit=${fixture.visitId}`);
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(fixture.siteName, { exact: true })).toHaveCount(
      0,
    );
    await page.goto("/today");
    await page
      .getByRole("combobox", { name: "Radni prostor", exact: true })
      .selectOption(fixture.org);
    await page
      .getByRole("button", { name: "Otvori radni prostor", exact: true })
      .click();
    await expect(page.getByText(orgNameA, { exact: true })).toBeVisible();
    await page.goto("/today");
    await expect(
      card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
    ).toBeVisible();
    await oldTab.reload();
    await expect(
      oldTab
        .getByRole("region", { name: /^Unos / })
        .first()
        .getByLabel("Nalaz", { exact: true }),
    ).toHaveValue("Workspace A draft");
    await expect(
      oldTab.getByRole("img", {
        name: "Workspace A private blob",
        exact: true,
      }),
    ).toBeVisible();
    const capturedBundle = (await localBundles(page))[0];
    const olderInventory = await (
      await page.request.get("/api/field/offline-context")
    ).json();
    // Withdrawing an assignment is recognized on the next successful context verification.
    await fixture.db.query(
      "delete from public.visit_assignees where organization_id=$1 and visit_id=$2 and membership_id=$3",
      [fixture.org, fixture.visitId, membershipA],
    );
    await page.goto("/today");
    await expect.poll(async () => (await localBundles(page)).length).toBe(0);
    await page.route("**/api/field/offline-context", (route) =>
      route.fulfill({ json: olderInventory }),
    );
    const rejected = await page.evaluate(async (bundle) => {
      const path = "/offline/v1/storage.js";
      const storage = await import(path);
      const current = await storage.verifyIdentity();
      try {
        await storage.saveBundle(current, bundle);
        return false;
      } catch {
        return true;
      }
    }, capturedBundle);
    expect(rejected).toBe(true);
    expect(await localBundles(page)).toHaveLength(0);
    await page.unroute("**/api/field/offline-context");
    await page.goto(`/offline/v1/index.html?visit=${fixture.visitId}`);
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Zadrži na uređaju i nastavi", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page, "owner.b@hvac.example.invalid");
    await page.goto("/today");
    await expect(
      page.getByText("Nalog i radni prostor su potvrđeni za ovaj telefon.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(async () => (await localBundles(page)).length).toBe(0);
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Poseta nije preuzeta", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(fixture.siteName, { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: info.outputPath("isolated-offline-visit.png"),
      fullPage: true,
    });
  } finally {
    await context.setOffline(false);
    await oldTab.close();
    await fixture.dispose();
    await unassigned.dispose();
    await api.auth.signOut({ scope: "local" });
    await identity.dispose();
  }
});
