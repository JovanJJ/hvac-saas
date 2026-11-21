import { test, expect, type Page } from "@playwright/test";
import { createReportFixture } from "./report-fixture";
async function login(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByLabel("Email adresa")
    .fill("technician.a@hvac.example.invalid");
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
}
async function prepare(
  page: Page,
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
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
  await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
  const editor = page.getByRole("region", { name: /^Unos / }).first();
  await editor.getByLabel("Nalaz", { exact: true }).fill("Fiktivan M4f nalaz");
  await expect(
    editor.getByText("Sačuvano na telefonu · nije poslato.", { exact: true }),
  ).toBeVisible();
  return editor;
}
async function summary(page: Page) {
  return page.evaluate(async () => {
    const path = "/offline/v2/storage.js",
      s = await import(path);
    return s.deviceWork();
  });
}
test("pending removal offers keep and explicit discard; failed cleanup retains every private record", async ({
  page,
  context,
}, info) => {
  const fixture = await createReportFixture({ submitted: false });
  await context.route("**/api/field/sync", (route) => route.abort());
  try {
    await prepare(page, fixture);
    await page.goto("/offline/v2/index.html");
    await page
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Neposlatih stavki: 1");
    await expect(
      dialog.getByRole("button", {
        name: "Obriši lokalno i nastavi",
        exact: true,
      }),
    ).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await dialog.screenshot({
      path: info.outputPath("pending-device-choice.png"),
    });
    await dialog
      .getByRole("button", { name: "Zadrži posetu", exact: true })
      .click();
    expect((await summary(page)).pending).toBe(1);
    // A separate locked partition and recovery history must also be removed by shared-device cleanup.
    await page.evaluate(async () => {
      const path = "/offline/v2/storage.js",
        s = await import(path),
        identity = await s.activeIdentity();
      await s.guarded(identity, "readwrite", (tx: IDBTransaction) => {
        tx.objectStore("recoveries").put({
          userId: "other-fictional-user",
          organizationId: "other-fictional-workspace",
          operationId: crypto.randomUUID(),
          privateNote: "fictional",
        });
      });
    });
    const original = await summary(page);
    await page
      .getByRole("button", { name: "Očisti podatke ovog uređaja", exact: true })
      .click();
    await dialog.getByRole("checkbox").check();
    // Simulate a device storage transaction failure after requests were issued.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (key) {
        if (this.name === "drafts")
          throw new DOMException("simulated storage failure", "UnknownError");
        return original.call(this, key);
      };
      Object.assign(window, {
        restoreDeviceDelete: () => {
          IDBObjectStore.prototype.delete = original;
        },
      });
    });
    await dialog
      .getByRole("button", { name: "Obriši lokalno i nastavi", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(await summary(page)).toEqual(original);
    await page.evaluate(() =>
      (
        window as unknown as { restoreDeviceDelete: () => void }
      ).restoreDeviceDelete(),
    );
    await dialog.getByRole("button", { name: "Otkaži", exact: true }).click();
    await page
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Obriši lokalno i nastavi", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(await summary(page)).toEqual({
      records: 1,
      pending: 0,
      uncertain: 0,
    });
    await page
      .getByRole("button", { name: "Očisti podatke ovog uređaja", exact: true })
      .click();
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Obriši lokalno i nastavi", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(await summary(page)).toEqual({
      records: 0,
      pending: 0,
      uncertain: 0,
    });
    await expect(
      page.getByRole("heading", { name: "Preuzete posete", exact: true }),
    ).toBeVisible();
    await page.reload();
    expect(await summary(page)).toEqual({
      records: 0,
      pending: 0,
      uncertain: 0,
    });
  } finally {
    await fixture.dispose();
  }
});
test("sign-out keeps drafts, sync choice requires prepared work, then acknowledges before removing the device copy", async ({
  page,
  context,
}, info) => {
  const fixture = await createReportFixture({ submitted: false });
  await context.route("**/api/field/sync", (route) => route.abort());
  try {
    await prepare(page, fixture);
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Neposlatih stavki: 1");
    await page.screenshot({
      path: info.outputPath("sign-out-device-choice.png"),
      fullPage: false,
    });
    await dialog
      .getByRole("button", { name: "Sinhronizuj pa nastavi", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("Pripremite nacrte");
    await expect(page).toHaveURL(/\/today$/);
    await dialog
      .getByRole("button", { name: "Zadrži na uređaju i nastavi", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
    expect((await summary(page)).pending).toBe(1);
    await login(page);
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    const editor = page.getByRole("region", { name: /^Unos / }).first();
    await expect(editor.getByLabel("Nalaz", { exact: true })).toHaveValue(
      "Fiktivan M4f nalaz",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await expect(editor.getByRole("status")).toContainText("Čeka slanje");
    await page.goto("/offline/v2/index.html");
    await page
      .getByRole("button", { name: "Ukloni sa telefona", exact: true })
      .click();
    await context.unroute("**/api/field/sync");
    await dialog
      .getByRole("button", { name: "Sinhronizuj pa nastavi", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect((await summary(page)).records).toBe(0);
    expect(
      (
        await fixture.db.query(
          "select finding from public.visit_items where id=$1",
          [fixture.itemIds[0]],
        )
      ).rows[0].finding,
    ).toBe("Fiktivan M4f nalaz");
  } finally {
    await fixture.dispose();
  }
});
test("uncertain transport prevents discard and a worker upgrade keeps queued operation IDs and blobs", async ({
  page,
  context,
}) => {
  const fixture = await createReportFixture({ submitted: false });
  await context.route("**/api/field/sync", (route) => route.abort());
  await context.route("**/api/field/offline-photos/**", (route) =>
    route.abort(),
  );
  try {
    const editor = await prepare(page, fixture);
    const photos = page
      .getByRole("region", { name: /^Fotografije na telefonu / })
      .first();
    await photos.getByLabel("Izaberite fotografiju").setInputFiles({
      name: "fictional.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await photos.getByLabel("Opis fotografije").fill("Fiktivan M4f snimak");
    await photos.getByLabel("Vidljivost fotografije").selectOption("internal");
    await photos
      .getByRole("button", {
        name: "Sačuvaj fotografiju na telefonu",
        exact: true,
      })
      .click();
    await expect(
      photos.getByRole("img", { name: "Fiktivan M4f snimak", exact: true }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await expect(editor.getByRole("status")).toContainText("Čeka slanje");
    await page.evaluate(async (visitId) => {
      const path = "/offline/v2/storage.js",
        s = await import(path),
        identity = await s.activeIdentity();
      await s.prepareSync(identity, visitId);
    }, fixture.visitId);
    await page
      .getByRole("button", { name: "Očisti podatke ovog uređaja", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Slanje je već pokušano");
    await expect(dialog.getByRole("checkbox")).toBeDisabled();
    await dialog.getByRole("button", { name: "Otkaži", exact: true }).click();
    const before = await page.evaluate(async (visitId) => {
      const path = "/offline/v2/storage.js",
        s = await import(path),
        identity = await s.activeIdentity();
      return (await s.listDrafts(identity, visitId))[0];
    }, fixture.visitId);
    // A different same-origin script URL installs a real waiting worker, with the current editor still controlled.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        `/sw.js?m4f=${crypto.randomUUID()}`,
        { scope: "/", updateViaCache: "none" },
      );
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error("worker did not wait")),
          15000,
        );
        const check = () => {
          if (registration.waiting) {
            clearTimeout(deadline);
            resolve();
          }
        };
        registration.installing?.addEventListener("statechange", check);
        check();
      });
    });
    // Close every app client so the waiting worker can activate, then reopen offline.
    await page.close();
    page = await context.newPage();
    await page.goto("/offline/v1/icon.svg");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await navigator.serviceWorker.getRegistration("/");
          return !!r?.active && !r.waiting;
        }),
      )
      .toBe(true);
    // Recreate the preceding v4 schema with its actual committed data, including the private Blob.
    await page.evaluate(async () => {
      const open = (version?: number) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const r = version
            ? indexedDB.open("teren-field", version)
            : indexedDB.open("teren-field");
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const db = await open();
      const names = ["meta", "bundles", "drafts", "submissions", "photos"];
      const captured = await new Promise<
        {
          name: string;
          keyPath: string | string[] | null;
          indexes: {
            name: string;
            keyPath: string | string[];
            unique: boolean;
          }[];
          keys: IDBValidKey[];
          rows: unknown[];
        }[]
      >((resolve) => {
        const tx = db.transaction(names, "readonly");
        const pending = names.map((name) => {
          const store = tx.objectStore(name);
          return {
            name,
            keyPath: store.keyPath,
            indexes: Array.from(store.indexNames).map((name) => {
              const index = store.index(name);
              return { name, keyPath: index.keyPath, unique: index.unique };
            }),
            keys: store.getAllKeys(),
            rows: store.getAll(),
          };
        });
        tx.oncomplete = () =>
          resolve(
            pending.map((record) => ({
              ...record,
              keys: record.keys.result,
              rows: record.rows.result,
            })),
          );
      });
      db.close();
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase("teren-field");
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
      const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("teren-field", 4);
        r.onupgradeneeded = () => {
          for (const record of captured) {
            const store = r.result.createObjectStore(
              record.name,
              record.keyPath ? { keyPath: record.keyPath } : undefined,
            );
            for (const index of record.indexes)
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique,
              });
          }
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = legacy.transaction(names, "readwrite");
        for (const record of captured)
          record.rows.forEach((row, i) => {
            if (record.keyPath) tx.objectStore(record.name).put(row);
            else tx.objectStore(record.name).put(row, record.keys[i]);
          });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      legacy.close();
    });
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    const after = await page.evaluate(async (visitId) => {
      const path = "/offline/v2/storage.js",
        s = await import(path),
        identity = await s.activeIdentity();
      return (await s.listDrafts(identity, visitId))[0];
    }, fixture.visitId);
    expect(after).toEqual(before);
    await expect(
      page.getByRole("img", { name: "Fiktivan M4f snimak", exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: /^Unos / })
        .first()
        .getByLabel("Nalaz", { exact: true }),
    ).toHaveValue(before.values.finding);
  } finally {
    await fixture.dispose();
  }
});

test("unsaved photo selection blocks destructive transitions and storage denial still permits sign-out with keep", async ({
  page,
  context,
}) => {
  const fixture = await createReportFixture({ submitted: false });
  await context.route("**/api/field/sync", (route) => route.abort());
  try {
    await prepare(page, fixture);
    const photos = page
      .getByRole("region", { name: /^Fotografije na telefonu / })
      .first();
    await photos.getByLabel("Opis fotografije").fill("Još nije sačuvano");
    await page
      .getByRole("button", { name: "Očisti podatke ovog uređaja", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText("još nije sačuvan");
    await expect(
      dialog.getByRole("button", {
        name: "Obriši lokalno i nastavi",
        exact: true,
      }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Otkaži", exact: true }).click();
    page.once("dialog", (d) => d.accept());
    await page.goto("/today");
    await page.evaluate(() => {
      indexedDB.open = () => {
        throw new DOMException("simulated storage denial", "SecurityError");
      };
    });
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Memorija nije dostupna",
    );
    await dialog
      .getByRole("button", { name: "Zadrži na uređaju i nastavi", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
  } finally {
    await fixture.dispose();
  }
});
