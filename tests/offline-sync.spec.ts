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
import { randomUUID } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import type { FieldDraft } from "../features/offline/draft-model";
import type { Submission, SyncOperation } from "../features/offline/sync-model";
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
  return page.evaluate(async (visitId) => {
    const path = "/offline/v2/storage.js",
      storage = await import(path);
    const identity = await storage.activeIdentity();
    return {
      drafts: await storage.listDrafts(identity, visitId),
      submission: await storage.getSubmission(identity, visitId),
    };
  }, visitId);
}
test("lost save and submission responses replay once after restart; office sees confirmed fieldwork", async ({
  baseURL,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture({ submitted: false });
  const profile = await mkdtemp(join(tmpdir(), "teren-sync-"));
  const options = {
    baseURL,
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    viewport: info.project.use.viewport,
  };
  let context = await chromium.launchPersistentContext(profile, options);
  let droppedSave = false,
    droppedSubmit = false;
  const requests: SyncOperation[][] = [];
  async function lostResponses(ctx: BrowserContext) {
    await ctx.route("**/api/field/sync", async (route) => {
      const operations = route.request().postDataJSON()
        .operations as SyncOperation[];
      requests.push(operations);
      const response = await route.fetch(); // Commit at the real server, then discard its response.
      if (operations[0].type === "save" && !droppedSave) {
        droppedSave = true;
        await route.abort();
      } else if (operations[0].type === "submit" && !droppedSubmit) {
        droppedSubmit = true;
        await route.abort();
      } else await route.fulfill({ response });
    });
  }
  try {
    await lostResponses(context);
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
    const editors = page.getByRole("region", { name: /^Unos / });
    await editors
      .nth(0)
      .getByLabel("Obavljeni radovi", { exact: true })
      .fill("Fiktivan rad bez veze");
    await editors
      .nth(1)
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivni nalaz bez veze");
    await expect(editors.nth(0).getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await expect(editors.nth(1).getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editors
      .nth(0)
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await editors
      .nth(1)
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Pripremi predaju kancelariji",
        exact: true,
      })
      .click();
    const queued = await local(page, fixture.visitId);
    expect(queued.submission?.baseVersion).toBe(fixture.version + 2);
    await expect(
      page
        .getByRole("region", { name: "Predaja posete", exact: true })
        .getByRole("status"),
    ).toContainText("Poseta još nije predata");
    await context.setOffline(false);
    await expect.poll(() => droppedSave).toBe(true);
    await expect(
      page
        .getByRole("region", { name: "Sinhronizacija", exact: true })
        .getByRole("status"),
    ).toContainText("Veza je prekinuta");
    const uncertain = await local(page, fixture.visitId);
    expect(uncertain.drafts).toHaveLength(2);
    expect(uncertain.drafts.every((d) => d.attemptedAt !== null)).toBe(true);
    expect(
      (
        await fixture.db.query(
          "select status,version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0],
    ).toEqual({ status: "in_progress", version: fixture.version + 2 });
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await lostResponses(context);
    await context.setOffline(true);
    page = context.pages()[0] || (await context.newPage());
    await page.goto(`/visits/${fixture.visitId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect.poll(() => local(page, fixture.visitId)).toEqual(uncertain);
    await context.setOffline(false);
    await expect.poll(() => droppedSubmit).toBe(true);
    const sync = page.getByRole("region", {
      name: "Sinhronizacija",
      exact: true,
    });
    await expect(sync.getByRole("status")).toContainText("Veza je prekinuta");
    const beforeSubmitAck = await local(page, fixture.visitId);
    expect(beforeSubmitAck.drafts).toHaveLength(0);
    expect(beforeSubmitAck.submission?.attemptedAt).not.toBeNull();
    await expect(
      page
        .getByRole("region", { name: "Predaja posete", exact: true })
        .getByRole("status"),
    ).toContainText("Poseta još nije predata");
    expect(
      (
        await fixture.db.query(
          "select status,version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0],
    ).toEqual({ status: "submitted", version: fixture.version + 3 });
    await sync
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    await expect
      .poll(() => local(page, fixture.visitId))
      .toEqual({ drafts: [], submission: null });
    await expect(sync.getByRole("status")).toContainText(
      "Potvrđeno na serveru",
    );
    await expect(page.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(
      page.getByText("Radovi: Fiktivan rad bez veze", { exact: true }),
    ).toBeVisible();
    expect(requests.filter((ops) => ops[0].type === "save")).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    const submissions = requests.filter((ops) => ops[0].type === "submit");
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toEqual(submissions[1]);
    const saved = (
      await fixture.db.query(
        "select id,version,entered_by,work,finding from public.visit_items where visit_id=$1 order by id",
        [fixture.visitId],
      )
    ).rows;
    for (const draft of queued.drafts) {
      const item = saved.find((i) => i.id === draft.itemId);
      expect(item.version).toBe(draft.baseItemVersion + 1);
      expect(item.entered_by).toBe(draft.actorId);
    }
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from hvac_private.field_replay_receipts where organization_id=$1 and payload->>'visit'=$2",
          [fixture.org, fixture.visitId],
        )
      ).rows[0].count,
    ).toBe(3);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int as count from public.follow_ups where item_id in(select id from public.visit_items where visit_id=$1)",
          [fixture.visitId],
        )
      ).rows[0].count,
    ).toBe(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("confirmed-offline-sync.png"),
      fullPage: true,
    });
    await page.goto("/today");
    await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Zadrži na uređaju i nastavi", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
    await login(page, "owner.a@hvac.example.invalid");
    await page.goto(`/visits/${fixture.visitId}/review`);
    await expect(
      page.getByText("Radovi: Fiktivan rad bez veze", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Nalaz: Fiktivni nalaz bez veze", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    await fixture.dispose();
    await rm(profile, { recursive: true, force: true });
  }
});
test("ordered batch keeps earlier successes on conflict and rejects unauthorized or oversized replay", async ({
  page,
  baseURL,
}) => {
  const fixture = await createReportFixture({ submitted: false });
  try {
    await login(page);
    const identity = (
      await (await page.request.get("/api/field/offline-context")).json()
    ).identity;
    const bundle = (
      await (
        await page.request.get(`/api/field/visits/${fixture.visitId}`)
      ).json()
    ).bundle;
    const operations: SyncOperation[] = bundle.visit.items.slice(0, 3).map(
      (
        item: {
          id: string;
          version: number;
          outcome: "serviced";
          work: string;
          finding: string;
          noAccessReason: string;
          internalNote: string;
          readings: [];
          parts: [];
          followUp: null;
        },
        n: number,
      ) => ({
        operationId: randomUUID(),
        entityId: fixture.visitId,
        type: "save",
        baseVersion: n === 1 ? 99999 : item.version,
        payload: {
          itemId: item.id,
          outcome: item.outcome,
          work: item.work,
          finding: item.finding,
          noAccessReason: item.noAccessReason,
          internalNote: item.internalNote,
          readings: item.readings,
          parts: item.parts,
          followUp: item.followUp,
        },
      }),
    );
    const post = (data: unknown, origin = baseURL!) =>
      page.request.post("/api/field/sync", {
        headers: { Origin: origin },
        data,
      });
    const body = {
      userId: identity.userId,
      organizationId: identity.organizationId,
      epoch: identity.epoch,
      operations,
    };
    expect((await post(body, "https://unrelated.invalid")).status()).toBe(403);
    expect((await post({ ...body, userId: randomUUID() })).status()).toBe(409);
    expect(
      (
        await post({
          ...body,
          operations: Array.from({ length: 11 }, () => operations[0]),
        })
      ).status(),
    ).toBe(422);
    expect(
      (await post({ ...body, padding: "x".repeat(200001) })).status(),
    ).toBe(413);
    const first = await post(body);
    expect(first.status()).toBe(200);
    const result = await first.json();
    expect(result.results.map((r: { status: number }) => r.status)).toEqual([
      200, 409, 424,
    ]);
    const retry = await (await post(body)).json();
    expect(retry.results[0].acknowledgement).toEqual(
      result.results[0].acknowledgement,
    );
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 1);
    const foreign = {
      ...body,
      operations: [
        { ...operations[0], operationId: randomUUID(), entityId: randomUUID() },
      ],
    };
    expect((await (await post(foreign)).json()).results[0].status).toBe(404);
    const malformedLater = await post({
      ...body,
      operations: [
        operations[2],
        {
          ...operations[1],
          operationId: randomUUID(),
          payload: {
            ...operations[1].payload,
            readings: [
              {
                kind: "Struja",
                mode: "Hlađenje",
                unit: "A",
                status: "measured",
                value: null,
              },
            ],
          },
        },
      ],
    });
    expect(
      (await malformedLater.json()).results.map(
        (r: { status: number }) => r.status,
      ),
    ).toEqual([200, 422]);
  } finally {
    await fixture.dispose();
  }
});
test("a failed acknowledgement write retains the operation and retry confirms it without a second server write", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture({ submitted: false });
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
    const editor = page.getByRole("region", { name: /^Unos / }).first();
    await editor
      .getByLabel("Nalaz", { exact: true })
      .fill("Fiktivni nacrt sa greškom potvrde");
    await expect(editor.getByRole("status")).toHaveText(
      "Sačuvano na telefonu · nije poslato.",
    );
    await editor
      .getByRole("button", { name: "Pripremi za slanje", exact: true })
      .click();
    const operationId = (await local(page, fixture.visitId)).drafts[0]
      .operationId;
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "bundles") {
          IDBObjectStore.prototype.put = original;
          throw new DOMException(
            "Fictional acknowledgement failure",
            "QuotaExceededError",
          );
        }
        return original.call(this, value, key);
      };
    });
    await context.setOffline(false);
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
    const sync = page.getByRole("region", {
      name: "Sinhronizacija",
      exact: true,
    });
    await expect(sync.getByRole("status")).toContainText(
      "Potvrda nije sačuvana",
    );
    expect((await local(page, fixture.visitId)).drafts[0].operationId).toBe(
      operationId,
    );
    await sync
      .getByRole("button", { name: "Sinhronizuj sada", exact: true })
      .click();
    await expect
      .poll(async () => (await local(page, fixture.visitId)).drafts.length)
      .toBe(0);
    await expect(
      page
        .getByRole("region", { name: /^Unos / })
        .first()
        .getByRole("status"),
    ).toHaveText("Potvrđeno na serveru · nema lokalnih izmena.");
    expect(
      (
        await fixture.db.query(
          "select version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0].version,
    ).toBe(fixture.version + 1);
    await page.screenshot({
      path: info.outputPath("confirmed-draft.png"),
      fullPage: true,
    });
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
test("a later item conflict retains that draft and blocks submission after an earlier item is acknowledged", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture({ submitted: false });
  try {
    await login(page);
    const identity = (
      await (await page.request.get("/api/field/offline-context")).json()
    ).identity;
    const bundle = (
      await (
        await page.request.get(`/api/field/visits/${fixture.visitId}`)
      ).json()
    ).bundle;
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
    const editors = page.getByRole("region", { name: /^Unos / });
    for (const n of [0, 1]) {
      await editors
        .nth(n)
        .getByLabel("Nalaz", { exact: true })
        .fill(`Fiktivni lokalni nalaz ${n}`);
      await expect(editors.nth(n).getByRole("status")).toHaveText(
        "Sačuvano na telefonu · nije poslato.",
      );
      await editors
        .nth(n)
        .getByRole("button", { name: "Pripremi za slanje", exact: true })
        .click();
    }
    await page
      .getByRole("button", {
        name: "Pripremi predaju kancelariji",
        exact: true,
      })
      .click();
    const before = await local(page, fixture.visitId);
    // Another device changes the second item under a separate, authorized command.
    const item = bundle.visit.items[1];
    const payload = {
      itemId: item.id,
      outcome: item.outcome,
      work: "Fiktivna promena na drugom uređaju",
      finding: item.finding,
      noAccessReason: item.noAccessReason,
      internalNote: item.internalNote,
      readings: item.readings,
      parts: item.parts,
      followUp: item.followUp,
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
            baseVersion: item.version,
            type: "save",
            payload,
          },
        ],
      },
    });
    expect((await changed.json()).results[0].status).toBe(200);
    await context.setOffline(false);
    await expect(editors.nth(1).getByRole("alert")).toContainText(
      "Podaci su promenjeni na serveru",
    );
    const retained = await local(page, fixture.visitId);
    expect(retained.drafts).toHaveLength(1);
    expect(retained.drafts[0].operationId).toBe(
      before.drafts.find((d) => d.itemId === item.id)!.operationId,
    );
    expect(retained.drafts[0].values.finding).toBe("Fiktivni lokalni nalaz 1");
    expect(retained.submission?.attemptedAt).toBeNull();
    await expect(editors.nth(0).getByRole("status")).toHaveText(
      "Potvrđeno na serveru · nema lokalnih izmena.",
    );
    expect(
      (
        await fixture.db.query(
          "select status,version from public.visits where id=$1",
          [fixture.visitId],
        )
      ).rows[0],
    ).toEqual({ status: "in_progress", version: fixture.version + 2 });
    expect(
      (
        await fixture.db.query(
          "select work from public.visit_items where id=$1",
          [item.id],
        )
      ).rows[0].work,
    ).toBe("Fiktivna promena na drugom uređaju");
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
