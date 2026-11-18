import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createReportFixture } from "./report-fixture";
import { attachFictionalReportPhoto } from "./pdf-photo-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const hash = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
test("office reviews and issues an amendment while original PDF, links and receipts remain immutable", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture();
  const cleanupPhoto = await attachFictionalReportPhoto(fixture);
  const owner = api(),
    anonymous = api(),
    worker = await workerClient(),
    others = [];
  const guestContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  const guest = await guestContext.newPage();
  try {
    expect(
      (
        await owner.auth.signInWithPassword({
          email: "owner.a@hvac.example.invalid",
          password: process.env.SEED_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    const issued = await owner.rpc("issue_report", {
      p_organization_id: fixture.org,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const oldId = issued.data as string;
    const firstJob = await claimJob(worker, oldId);
    expect(firstJob).not.toBeNull();
    await processJob(worker, firstJob!);
    async function link(revisionId: string) {
      const token = randomBytes(32).toString("base64url");
      const result = await owner.rpc("create_report_link", {
        p_organization_id: fixture.org,
        p_revision_id: revisionId,
        p_operation_id: randomUUID(),
        p_token_hash: hash(token),
        p_ttl_days: 7,
      });
      expect(result.error).toBeNull();
      return { token, id: result.data.id as string };
    }
    const oldLink = await link(oldId),
      lateLink = await link(oldId);
    const originalReceipt = await anonymous.rpc("acknowledge_report", {
      p_token: oldLink.token,
      p_name: "Mila Đurić",
      p_role: "Upravnik",
      p_acknowledged: true,
    });
    expect(originalReceipt.error).toBeNull();
    const original = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: oldId,
    });
    const oldPdf = await owner.storage
      .from("report-pdfs")
      .download(original.data.artifact.path);
    expect(oldPdf.error).toBeNull();
    const originalBytes = Buffer.from(await oldPdf.data!.arrayBuffer());
    const initial = await owner.rpc("report_amendment", {
      p_organization_id: fixture.org,
      p_revision_id: oldId,
    });
    expect(initial.error).toBeNull();
    const rowBefore = (
      await fixture.db.query(
        "select entered_by,entered_at from public.visit_items where id=$1",
        [initial.data.items[2].itemId],
      )
    ).rows[0];
    await fixture.db.query(
      "update public.customers set name='MUTABLE CUSTOMER' where id=$1",
      [fixture.customerId],
    );
    await fixture.db.query(
      "update public.systems set code='ZZ-03',model='MUTABLE MODEL' where id=$1",
      [fixture.systemIds[2]],
    );
    const badItems = structuredClone(initial.data.items);
    badItems[0].finding = "MUST ROLLBACK";
    badItems[2].followUp.ownerId = "";
    expect(
      (
        await owner.rpc("amend_report", {
          p_organization_id: fixture.org,
          p_base_revision_id: oldId,
          p_operation_id: randomUUID(),
          p_version: initial.data.visitVersion,
          p_reason: "Invalid owner",
          p_items: badItems,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (
        await fixture.db.query(
          "select finding from public.visit_items where id=$1",
          [badItems[0].itemId],
        )
      ).rows[0].finding,
    ).not.toBe("MUST ROLLBACK");
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/office/reports/${oldId}`);
    const panel = page.getByRole("group", { name: "Ispravka izveštaja" });
    await page.getByText("Ispravi izveštaj", { exact: true }).click();
    await page.getByRole("button", { name: "Pregledaj ispravku" }).click();
    await expect(panel.getByRole("alert")).toContainText("Unesite razlog");
    await page
      .getByLabel("Razlog ispravke (vidljiv klijentu)", { exact: true })
      .fill("Ispravljen opis oštećenja deflektora.");
    const item = page.getByRole("group", { name: /Ispravka KL-03/ });
    await item
      .getByLabel("Nalaz za klijenta", { exact: true })
      .fill("Napukao deflektor; potreban zamenski deo čćšžđ.");
    const ownerId = initial.data.items[2].followUp.ownerId;
    await item.getByLabel("Odgovorni član tima").selectOption("");
    await page.getByRole("button", { name: "Pregledaj ispravku" }).click();
    await expect(panel.getByRole("alert")).toContainText("odgovorne");
    await item.getByLabel("Odgovorni član tima").selectOption(ownerId);
    await page.getByRole("button", { name: "Pregledaj ispravku" }).click();
    const draft = page.getByRole("article", {
      name: "Nacrt servisnog izveštaja",
    });
    await expect(draft).toContainText("Napukao deflektor");
    await expect(draft.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(draft).not.toContainText("MUTABLE");
    const payload = JSON.parse(
      await page.locator('input[name="payload"]').inputValue(),
    );
    await page
      .getByRole("button", { name: "Izdaj reviziju 2", exact: true })
      .click();
    await expect(page).toHaveURL(/\/office\/reports\/[a-f0-9-]+$/);
    await expect(page).not.toHaveURL(new RegExp(oldId));
    const newId = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("heading", { name: /RN-.*Revizija 2/, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Evidencija prijema" }),
    ).toContainText("Nema potvrde prijema.");
    const args = {
      p_organization_id: fixture.org,
      p_base_revision_id: payload.baseRevisionId,
      p_operation_id: payload.operationId,
      p_version: payload.version,
      p_reason: payload.reason,
      p_items: payload.items,
    };
    const retries = await Promise.all([
      owner.rpc("amend_report", args),
      owner.rpc("amend_report", args),
    ]);
    for (const response of retries) {
      expect(response.error).toBeNull();
      expect(response.data).toBe(newId);
    }
    expect(
      (await owner.rpc("amend_report", { ...args, p_reason: "Changed retry" }))
        .error?.code,
    ).toBe("PT409");
    expect(
      (
        await owner.rpc("amend_report", {
          ...args,
          p_operation_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    const replacement = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: newId,
    });
    expect(replacement.data.previousRevisionId).toBe(oldId);
    expect(replacement.data.data.templateVersion).toBe("service-report-v2");
    expect(replacement.data.data.customer).toBe(original.data.data.customer);
    expect(replacement.data.data.items[2].code).toBe("KL-03");
    expect(replacement.data.data.items[2].model).toBe(
      original.data.data.items[2].model,
    );
    expect(replacement.data.data.items[0].photos).toEqual(
      original.data.data.items[0].photos,
    );
    expect(JSON.stringify(replacement.data.data)).not.toContain("SECRET");
    const nextJob = await claimJob(worker, newId);
    expect(nextJob).not.toBeNull();
    await expect(
      processJob(worker, nextJob!, {
        afterUpload: async () => {
          throw new Error("simulated_exit");
        },
      }),
    ).rejects.toThrow("simulated_exit");
    await fixture.db.query(
      "update hvac_private.render_jobs set lease_until=now()-interval '1 second' where revision_id=$1",
      [newId],
    );
    const resumed = await claimJob(worker, newId);
    expect(resumed!.jobId).toBe(nextJob!.jobId);
    await processJob(worker, resumed!);
    await expect(
      page.getByRole("button", { name: "Napravi link za klijenta" }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Napravi link za klijenta" })
      .click();
    const copy = page.getByLabel("Link za kopiranje", { exact: true });
    await expect(copy).toBeVisible();
    const newToken = new URL(await copy.inputValue()).pathname
      .split("/")
      .at(-1)!;
    await guest.goto(`/r/${oldLink.token}`);
    await expect(guest.getByRole("article")).toContainText("Oštećen deflektor");
    await expect(
      guest.getByRole("region", { name: "Potvrda prijema" }),
    ).toContainText("Mila Đurić");
    expect(
      hash(await (await guest.request.get(`/r/${oldLink.token}/pdf`)).body()),
    ).toBe(hash(originalBytes));
    expect(
      (await anonymous.rpc("guest_report", { p_token: oldLink.token })).data
        .receipt,
    ).toEqual(originalReceipt.data);
    const late = await anonymous.rpc("acknowledge_report", {
      p_token: lateLink.token,
      p_name: "Nenad Čačić",
      p_role: "Kontakt objekta",
      p_acknowledged: true,
    });
    expect(late.error).toBeNull();
    expect(late.data.revisionId).toBe(oldId);
    await guest.goto(`/r/${newToken}`);
    await expect(guest.getByRole("article")).toContainText("Napukao deflektor");
    await expect(guest.getByRole("article")).toContainText(
      "Ispravka revizije 1",
    );
    await expect(
      guest
        .getByRole("region", { name: "Potvrda prijema" })
        .getByRole("button", { name: "Potvrdi prijem izveštaja" }),
    ).toBeVisible();
    const newDownload = await guest.request.get(`/r/${newToken}/pdf`);
    expect(newDownload.status()).toBe(200);
    const newBytes = await newDownload.body();
    expect(hash(newBytes)).not.toBe(hash(originalBytes));
    await mkdir("/tmp/hvac-amendment-review", { recursive: true });
    await writeFile(
      `/tmp/hvac-amendment-review/${info.project.name}-r1.pdf`,
      originalBytes,
    );
    await writeFile(
      `/tmp/hvac-amendment-review/${info.project.name}-r2.pdf`,
      newBytes,
    );
    await page.screenshot({
      path: info.outputPath("amended-office.png"),
      fullPage: true,
    });
    const corrected = (
      await fixture.db.query(
        "select entered_by,entered_at,corrected_by,corrected_at,finding from public.visit_items where id=$1",
        [initial.data.items[2].itemId],
      )
    ).rows[0];
    expect(corrected.entered_by).toBe(rowBefore.entered_by);
    expect(corrected.entered_at).toEqual(rowBefore.entered_at);
    expect(corrected.corrected_by).toBe("a1000000-0000-4000-8000-000000000101");
    expect(corrected.corrected_at).not.toBeNull();
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const c = api();
      others.push(c);
      expect(
        (
          await c.auth.signInWithPassword({
            email,
            password: process.env.SEED_PASSWORD!,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await c.rpc("report_amendment", {
            p_organization_id: fixture.org,
            p_revision_id: newId,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (await c.rpc("amend_report", { ...args, p_operation_id: randomUUID() }))
          .error?.code,
      ).toBe("42501");
    }
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from public.report_revisions where visit_id=$1",
          [fixture.visitId],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.render_jobs where revision_id=$1",
          [newId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.report_amendments where revision_id=$1",
          [newId],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.goto(`/office/reports/${oldId}`);
    await expect(
      page.getByRole("link", { name: "Otvori najnoviju reviziju" }),
    ).toBeVisible();
    await expect(
      page.getByText("Ispravi izveštaj", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Evidencija prijema" }),
    ).toContainText("Mila Đurić");
    const newLink = (
      await owner.rpc("report_links", {
        p_organization_id: fixture.org,
        p_revision_id: newId,
      })
    ).data[0];
    expect(
      (
        await owner.rpc("revoke_report_link", {
          p_organization_id: fixture.org,
          p_link_id: newLink.id,
        })
      ).error,
    ).toBeNull();
    expect((await guest.request.get(`/r/${newToken}/pdf`)).status()).toBe(404);
    expect((await guest.request.get(`/r/${lateLink.token}/pdf`)).status()).toBe(
      200,
    );
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await Promise.all(
      [owner, ...others].map((c) => c.auth.signOut({ scope: "local" })),
    );
    await guestContext.close();
    await cleanupPhoto();
    await fixture.dispose();
  }
});
