import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import type { FieldDraft } from "../features/offline/draft-model";
import type { Submission, SyncOperation } from "../features/offline/sync-model";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
  "base64",
);
async function login(page: Page, email = "technician.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(today|office)$/);
}
async function local(
  page: Page,
  visitId: string,
): Promise<{ drafts: FieldDraft[]; submission: Submission | null }> {
  return page.evaluate(async (id) => {
    const path = "/offline/v2/storage.js",
      s = await import(path),
      identity = await s.activeIdentity();
    return {
      drafts: await s.listDrafts(identity, id),
      submission: await s.getSubmission(identity, id),
    };
  }, visitId);
}
async function download(
  page: Page,
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: fixture.siteName, exact: true }),
  });
  await card
    .getByRole("button", { name: "Preuzmi za rad bez veze", exact: true })
    .click();
  await expect(
    card.getByText("Dostupno bez veze · lokalni unos", { exact: true }),
  ).toBeVisible();
  const identity = (
      await (await page.request.get("/api/field/offline-context")).json()
    ).identity,
    bundle = (
      await (
        await page.request.get(`/api/field/visits/${fixture.visitId}`)
      ).json()
    ).bundle;
  return { identity, bundle };
}
function payload(item: Record<string, unknown>) {
  return {
    itemId: item.id,
    outcome: item.outcome,
    work: item.work,
    finding: item.finding,
    noAccessReason: item.noAccessReason,
    internalNote: item.internalNote,
    readings: item.readings,
    parts: item.parts,
    followUp: item.followUp,
  };
}
async function history(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("teren-field");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction("recoveries", "readonly"),
          r = tx.objectStore("recoveries").getAll();
        tx.oncomplete = () => resolve(r.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
test("same-item conflict shows both values, queues a reviewed new operation and survives a lost reconciliation response", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture({ submitted: false });
  let dropped = false;
  const replacements: SyncOperation[] = [];
  await context.route("**/api/field/sync", async (route) => {
    const operations = route.request().postDataJSON()
      .operations as SyncOperation[];
    const replacement = operations.find(
      (o) => o.reconcileFrom && o.type === "save",
    );
    if (replacement) replacements.push(replacement);
    const response = await route.fetch();
    if (replacement && response.status() === 200 && !dropped) {
      dropped = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  try {
    await login(page);
    const { identity, bundle } = await download(page, fixture);
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    let editor = page.getByRole("region", { name: /^Unos / }).first();
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivni lokalni nalaz");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    const original = (await local(page, fixture.visitId)).drafts[0];
    const changed = await page.request.post("/api/field/sync", {
      headers: { Origin: baseURL! },
      data: {
        userId: identity.userId,
        organizationId: identity.organizationId,
        epoch: identity.epoch,
        operations: [
          {
            operationId: randomUUID(),
            entityId: fixture.visitId,
            type: "save",
            baseVersion: bundle.visit.items[0].version,
            payload: {
              ...payload(bundle.visit.items[0]),
              finding: "Fiktivni noviji serverski nalaz",
            },
          },
        ],
      },
    });
    expect((await changed.json()).results[0].status).toBe(200);
    await context.setOffline(false);
    await expect(
      page.getByRole("region", { name: "Usaglašavanje", exact: true }),
    ).toBeVisible();
    const review = page.getByRole("article", {
      name: "Sukob KL-01",
      exact: true,
    });
    await context.setOffline(true);
    await review
      .getByRole("button", { name: "Učitaj trenutno stanje", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText("Povežite se");
    await context.setOffline(false);
    await review
      .getByRole("button", { name: "Učitaj trenutno stanje", exact: true })
      .click();
    await expect(
      review.getByRole("cell", { name: "Fiktivni lokalni nalaz", exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("cell", {
        name: "Fiktivni noviji serverski nalaz",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", {
        name: "Nastavi lokalni nacrt",
        exact: true,
      }),
    ).toBeDisabled();
    await review.getByRole("checkbox").check();
    await page.screenshot({
      path: info.outputPath("item-conflict-comparison.png"),
      fullPage: true,
    });
    await review
      .getByRole("button", { name: "Nastavi lokalni nacrt", exact: true })
      .click();
    await expect
      .poll(async () => (await local(page, fixture.visitId)).drafts[0].status)
      .toBe("local");
    const next = (await local(page, fixture.visitId)).drafts[0];
    expect(next.operationId).not.toBe(original.operationId);
    expect(next.reconcileFrom).toBe(original.operationId);
    expect(next.baseItemVersion).toBe(original.baseItemVersion + 1);
    editor = page.getByRole("region", { name: /^Unos / }).first();
    await expect(editor.getByLabel("Nalaz", { exact: true })).toHaveValue(
      "Fiktivni lokalni nalaz",
    );
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivni usaglašen nalaz");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
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
    ).toContainText("čeka slanje");
    await page
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    const sync = page.getByRole("region", {
      name: "Sinhronizacija",
      exact: true,
    });
    await expect(sync.getByRole("status")).toContainText("Veza je prekinuta");
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
      )
      .toBe("submitted");
    expect(replacements).toHaveLength(2);
    expect(replacements[0]).toEqual(replacements[1]);
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 3);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.field_reconciliations where payload->>'visit'=$1",
          [fixture.visitId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await history(page)).toHaveLength(1);
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
test("reviewed handover recovers aggregate drift from online photo changes and refuses a stale review", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture({ submitted: false });
  try {
    await login(page);
    const { bundle } = await download(page, fixture);
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
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
    ).toContainText("čeka slanje");
    const old = (await local(page, fixture.visitId)).submission!;
    async function externalPhoto() {
      const data = {
        visitId: fixture.visitId,
        itemId: bundle.visit.items[0].id,
        attachmentId: randomUUID(),
        caption: "Fictional online evidence",
        visibility: "customer",
        bytes: png.length,
        mimeType: "image/png",
      };
      for (const kind of ["prepare", "remove"]) {
        const r = await page.request.post(`/api/field/attachments/${kind}`, {
          headers: { Origin: baseURL! },
          data,
        });
        expect(r.status()).toBe(200);
      }
    }
    await externalPhoto();
    await context.setOffline(false);
    let review = page.getByRole("article", {
      name: "Sukob predaje",
      exact: true,
    });
    await expect(review).toBeVisible();
    await review
      .getByRole("button", { name: "Učitaj trenutno stanje", exact: true })
      .click();
    await expect(review.getByRole("checkbox")).toBeVisible();
    await externalPhoto();
    await review.getByRole("checkbox").check();
    await review
      .getByRole("button", { name: "Pripremi novu predaju", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await local(page, fixture.visitId)).submission?.operationId,
      )
      .not.toBe(old.operationId);
    await page
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    review = page.getByRole("article", { name: "Sukob predaje", exact: true });
    await expect(review).toBeVisible();
    expect(
      (
        await fixture.db.query("select status from public.visits where id=$1", [
          fixture.visitId,
        ])
      ).rows[0].status,
    ).toBe("in_progress");
    await review
      .getByRole("button", { name: "Učitaj trenutno stanje", exact: true })
      .click();
    await review.getByRole("checkbox").check();
    await page.screenshot({
      path: info.outputPath("submission-conflict-review.png"),
      fullPage: true,
    });
    await review
      .getByRole("button", { name: "Pripremi novu predaju", exact: true })
      .click();
    await expect(review).toHaveCount(0);
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
      )
      .toBe("submitted");
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 5);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.field_reconciliations where payload->>'visit'=$1",
          [fixture.visitId],
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(page.getByRole("definition")).toHaveText(["4", "3", "2"]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
test("expired sessions and withdrawn assignments retain drafts/blobs and resume only for the original authorized identity", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture({ submitted: false });
  let expire = true,
    photoCalls = 0;
  await context.route("**/api/field/sync", async (route) => {
    if (expire) {
      expire = false;
      await route.fulfill({
        status: 401,
        json: { error: "identity_unavailable" },
      });
    } else await route.continue();
  });
  await context.route("**/api/field/offline-photos/**", (route) => {
    photoCalls++;
    return route.abort();
  });
  try {
    await login(page);
    const { identity } = await download(page, fixture);
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    const editor = page.getByRole("region", { name: /^Unos / }).first();
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivan zadržan nacrt");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    const original = (await local(page, fixture.visitId)).drafts[0];
    const panel = page.getByRole("region", {
      name: "Fotografije na telefonu KL-01",
      exact: true,
    });
    await panel
      .getByLabel("Izaberite fotografiju", { exact: true })
      .setInputFiles({
        name: "fictional.png",
        mimeType: "image/png",
        buffer: png,
      });
    await panel
      .getByLabel("Opis fotografije", { exact: true })
      .fill("Fiktivan zadržan snimak");
    await panel
      .getByLabel("Vidljivost fotografije", { exact: true })
      .selectOption("internal");
    await panel
      .getByRole("button", {
        name: "Sačuvaj fotografiju na telefonu",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("img", { name: "Fiktivan zadržan snimak", exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(
      page.getByRole("link", { name: "Prijavi se ponovo", exact: true }),
    ).toBeVisible();
    expect(photoCalls).toBe(0);
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version);
    const assignment = (
      await fixture.db.query(
        "select membership_id from public.visit_assignees where visit_id=$1",
        [fixture.visitId],
      )
    ).rows[0].membership_id;
    await fixture.db.query(
      "delete from public.visit_assignees where visit_id=$1",
      [fixture.visitId],
    );
    await login(page, "owner.b@hvac.example.invalid");
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    await expect(page.getByText(fixture.siteName, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("img", { name: "Fiktivan zadržan snimak", exact: true }),
    ).toHaveCount(0);
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page);
    await page.goto("/today");
    const retained = page.getByRole("region", {
      name: "Zadržan lokalni rad",
      exact: true,
    });
    await expect(retained).toContainText("Nacrti: 1");
    await expect(retained).toContainText("Fotografije: 1");
    expect(photoCalls).toBe(0);
    await retained
      .getByRole("button", { name: "Proveri pristup ponovo", exact: true })
      .click();
    await expect(retained.getByRole("status")).toContainText(
      "Pristup poseti još nije obnovljen",
    );
    const current = (
      await (await page.request.get("/api/field/offline-context")).json()
    ).identity;
    const denied = await page.request.post("/api/field/recovery", {
      headers: { Origin: baseURL! },
      data: {
        userId: current.userId,
        organizationId: current.organizationId,
        epoch: current.epoch,
        visitId: fixture.visitId,
        operation: null,
        photoIds: [],
      },
    });
    expect(denied.status()).toBe(404);
    await page.screenshot({
      path: info.outputPath("withdrawn-retained-work.png"),
      fullPage: true,
    });
    await fixture.db.query(
      "insert into public.visit_assignees(organization_id,visit_id,membership_id)values($1,$2,$3)",
      [fixture.org, fixture.visitId, assignment],
    );
    await retained
      .getByRole("button", { name: "Proveri pristup ponovo", exact: true })
      .click();
    await expect(retained).toHaveCount(0);
    await page.goto(`/offline/v2/index.html?visit=${fixture.visitId}`);
    await expect(
      page.getByRole("img", { name: "Fiktivan zadržan snimak", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              "select version from public.visits where id=$1",
              [fixture.visitId],
            )
          ).rows[0].version,
      )
      .toBe(fixture.version + 1);
    const receipts = (
      await fixture.db.query(
        "select operation_id,actor_id from hvac_private.field_replay_receipts where payload->>'visit'=$1",
        [fixture.visitId],
      )
    ).rows;
    expect(receipts).toEqual([
      { operation_id: original.operationId, actor_id: identity.userId },
    ]);
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
test("keeping server values is atomic, retains the old draft and does not rewrite server authorship", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture({ submitted: false });
  try {
    expect(
      (
        await page.request.post("/api/field/recovery", {
          headers: { Origin: baseURL! },
          data: {},
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/field/recovery", {
          headers: { Origin: "https://unrelated.invalid" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    await login(page);
    const { identity, bundle } = await download(page, fixture);
    const wire = {
      userId: identity.userId,
      organizationId: identity.organizationId,
      epoch: identity.epoch,
      visitId: fixture.visitId,
      operation: null,
      photoIds: [],
    };
    expect(
      (
        await page.request.post("/api/field/recovery", {
          headers: { Origin: baseURL! },
          data: { ...wire, userId: randomUUID() },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.post("/api/field/recovery", {
          headers: { Origin: baseURL! },
          data: { ...wire, visitId: randomUUID() },
        })
      ).status(),
    ).toBe(404);
    await context.setOffline(true);
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    const editor = page.getByRole("region", { name: /^Unos / }).first();
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivni zadržani original");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    const original = (await local(page, fixture.visitId)).drafts[0];
    const remote = {
      ...payload(bundle.visit.items[0]),
      finding: "Fiktivni prihvaćeni serverski nalaz",
    };
    const changed = await page.request.post("/api/field/sync", {
      headers: { Origin: baseURL! },
      data: {
        userId: identity.userId,
        organizationId: identity.organizationId,
        epoch: identity.epoch,
        operations: [
          {
            operationId: randomUUID(),
            entityId: fixture.visitId,
            type: "save",
            baseVersion: bundle.visit.items[0].version,
            payload: remote,
          },
        ],
      },
    });
    expect((await changed.json()).results[0].status).toBe(200);
    const before = (
      await fixture.db.query(
        "select version,entered_by,entered_at,finding from public.visit_items where id=$1",
        [original.itemId],
      )
    ).rows[0];
    await context.setOffline(false);
    const review = page.getByRole("article", {
      name: "Sukob KL-01",
      exact: true,
    });
    await review
      .getByRole("button", { name: "Učitaj trenutno stanje", exact: true })
      .click();
    await review.getByRole("checkbox").check();
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "recoveries") {
          IDBObjectStore.prototype.put = original;
          throw new DOMException(
            "Fictional recovery storage failure",
            "QuotaExceededError",
          );
        }
        return original.call(this, value, key);
      };
    });
    await review
      .getByRole("button", { name: "Zadrži podatke sa servera", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "Usaglašavanje nije sačuvano",
    );
    expect((await local(page, fixture.visitId)).drafts[0]).toEqual({
      ...original,
      attemptedAt: expect.any(String),
      error: "stale_version",
      errorStatus: 409,
    });
    expect(await history(page)).toHaveLength(0);
    await review
      .getByRole("button", { name: "Zadrži podatke sa servera", exact: true })
      .click();
    await expect
      .poll(async () => (await local(page, fixture.visitId)).drafts.length)
      .toBe(0);
    await expect(
      page
        .getByRole("region", { name: /^Unos / })
        .first()
        .getByLabel("Nalaz", { exact: true }),
    ).toHaveValue("Fiktivni prihvaćeni serverski nalaz");
    expect(
      (
        await fixture.db.query(
          "select version,entered_by,entered_at,finding from public.visit_items where id=$1",
          [original.itemId],
        )
      ).rows[0],
    ).toEqual(before);
    expect(await history(page)).toMatchObject([
      {
        choice: "server",
        previous: {
          operationId: original.operationId,
          values: { finding: "Fiktivni zadržani original" },
        },
      },
    ]);
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
