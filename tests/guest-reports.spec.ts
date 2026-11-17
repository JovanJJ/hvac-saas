import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { attachFictionalReportPhoto } from "./pdf-photo-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const api = (token?: string) =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: token ? { "x-report-token": token } : {} },
    },
  );
test("office shares one ready revision; signed-out guest access expires and can be revoked", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture(),
    otherFixture = await createReportFixture({ systemCount: 1 });
  const cleanupPhoto = await attachFictionalReportPhoto(fixture);
  const owner = api(),
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
    async function issue(f: typeof fixture) {
      const r = await owner.rpc("issue_report", {
        p_organization_id: f.org,
        p_visit_id: f.visitId,
        p_operation_id: randomUUID(),
        p_version: f.version,
      });
      expect(r.error).toBeNull();
      return r.data as string;
    }
    const id = await issue(fixture),
      otherId = await issue(otherFixture);
    const linkArgs = {
      p_organization_id: fixture.org,
      p_revision_id: id,
      p_operation_id: randomUUID(),
      p_token_hash: hash(randomBytes(32).toString("base64url")),
      p_ttl_days: 7,
    };
    expect((await owner.rpc("create_report_link", linkArgs)).error?.code).toBe(
      "PT409",
    );
    await fixture.db.query(
      "update hvac_private.render_jobs set state='failed' where revision_id=$1",
      [id],
    );
    expect((await owner.rpc("create_report_link", linkArgs)).error?.code).toBe(
      "PT409",
    );
    await fixture.db.query(
      "update hvac_private.render_jobs set state='queued' where revision_id=$1",
      [id],
    );
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/office/reports/${id}`);
    await expect(
      page.getByRole("button", { name: "Napravi link za klijenta" }),
    ).toHaveCount(0);
    for (const revisionId of [id, otherId]) {
      const job = await claimJob(worker, revisionId);
      expect(job).not.toBeNull();
      await processJob(worker, job!);
    }
    await expect(
      page.getByRole("button", { name: "Napravi link za klijenta" }),
    ).toBeVisible({ timeout: 15000 });
    const tokenBefore = await page.locator('input[name="token"]').inputValue();
    const opBefore = await page
      .locator('input[name="operationId"]')
      .last()
      .inputValue();
    await page
      .getByRole("button", { name: "Napravi link za klijenta" })
      .click();
    const copy = page.getByLabel("Link za kopiranje", { exact: true });
    await expect(copy).toBeVisible();
    const url = await copy.inputValue(),
      token = new URL(url).pathname.split("/").at(-1)!;
    expect(token).toBe(tokenBefore);
    expect(token).toHaveLength(43);
    await page.getByRole("button", { name: "Kopiraj link" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Link je kopiran|Izaberite i kopirajte/ }),
    ).toBeVisible();
    const linkRows = await owner.rpc("report_links", {
      p_organization_id: fixture.org,
      p_revision_id: id,
    });
    expect(linkRows.error).toBeNull();
    expect(linkRows.data).toHaveLength(1);
    const linkId = linkRows.data[0].id;
    const exact = {
      ...linkArgs,
      p_operation_id: opBefore,
      p_token_hash: hash(token),
    };
    expect((await owner.rpc("create_report_link", exact)).data.id).toBe(linkId);
    expect(
      (await owner.rpc("create_report_link", { ...exact, p_ttl_days: 30 }))
        .error?.code,
    ).toBe("PT409");
    const before = (
      await fixture.db.query(
        "select snapshot from public.report_revisions where id=$1",
        [id],
      )
    ).rows[0].snapshot;
    const result = await guest.goto(url);
    expect(result?.headers()["cache-control"]).toContain("no-store");
    expect(result?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(result?.headers()["x-robots-tag"]).toContain("noindex");
    const article = guest.getByRole("article", {
      name: "Izdat servisni izveštaj",
    });
    await expect(article.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(article).not.toContainText("SECRET");
    await expect(guest.getByRole("navigation")).toHaveCount(0);
    await expect(
      guest.getByRole("button", { name: "Potvrdi prijem izveštaja" }),
    ).toBeVisible();
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.report_receipts where revision_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
    const image = guest.getByRole("img", {
      name: "Čist filter · potvrđena fotografija čćšžđ",
      exact: true,
    });
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        timeout: 30000,
      })
      .toBe(800);
    const photoUrl = await image.getAttribute("src");
    const photo = await guest.request.get(photoUrl!);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toBe("image/jpeg");
    const archived = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: id,
    });
    const downloaded = await guest.request.get(`/r/${token}/pdf`);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()["cache-control"]).toContain("no-store");
    expect(hashBytes(await downloaded.body())).toBe(
      archived.data.artifact.sha256,
    );
    await guest.screenshot({
      path: info.outputPath("guest-report.png"),
      fullPage: true,
    });
    const capability = api(token),
      anonymous = api();
    const direct = await capability.storage
      .from("report-pdfs")
      .download(archived.data.artifact.path);
    expect(direct.error).toBeNull();
    expect(
      (
        await anonymous.storage
          .from("report-pdfs")
          .download(archived.data.artifact.path)
      ).data,
    ).toBeNull();
    expect(
      (
        await capability.storage
          .from("report-pdfs")
          .download(`${fixture.org}/${otherId}.pdf`)
      ).data,
    ).toBeNull();
    const listed = await capability.storage
      .from("report-pdfs")
      .list(fixture.org);
    expect(listed.data || []).toEqual([]);
    expect(
      (
        await capability.storage
          .from("report-pdfs")
          .createSignedUrl(archived.data.artifact.path, 3600)
      ).data,
    ).toBeNull();
    expect(
      (
        await capability.storage
          .from("report-pdfs")
          .upload(`${fixture.org}/${randomUUID()}.pdf`, Buffer.from("no"), {
            contentType: "application/pdf",
          })
      ).error,
    ).not.toBeNull();
    await capability.storage
      .from("report-pdfs")
      .remove([archived.data.artifact.path]);
    expect(
      (
        await capability.storage
          .from("report-pdfs")
          .download(archived.data.artifact.path)
      ).error,
    ).toBeNull();
    expect(
      (await anonymous.rpc("guest_report", { p_token: hash(token) })).data,
    ).toBeNull();
    expect(
      (
        await anonymous.rpc("guest_report", {
          p_token: randomBytes(32).toString("base64url"),
        })
      ).data,
    ).toBeNull();
    const internal = (
      await fixture.db.query(
        "select id from public.attachments where visit_id=$1 and visibility='internal'",
        [fixture.visitId],
      )
    ).rows[0].id;
    for (const photoId of [internal, randomUUID(), otherFixture.itemIds[0]])
      expect(
        (await guest.request.get(`/r/${token}/photos/${photoId}`)).status(),
      ).toBe(404);
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
      for (const [name, args] of [
        ["create_report_link", { ...linkArgs, p_operation_id: randomUUID() }],
        ["report_links", { p_organization_id: fixture.org, p_revision_id: id }],
        [
          "revoke_report_link",
          { p_organization_id: fixture.org, p_link_id: linkId },
        ],
      ] as const)
        expect((await c.rpc(name, args)).error?.code).toBe("42501");
    }
    const stored = (
      await fixture.db.query(
        "select to_jsonb(l) row from hvac_private.report_links l where id=$1",
        [linkId],
      )
    ).rows[0].row;
    expect(stored.token_hash).toBe(hash(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(
      (
        await fixture.db.query(
          "select snapshot from public.report_revisions where id=$1",
          [id],
        )
      ).rows[0].snapshot,
    ).toEqual(before);
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.identity_events where subject_id=$1 and event_type<>'report_link_created'",
          [linkId],
        )
      ).rows[0].n,
    ).toBe(0);
    await fixture.db.query(
      "update hvac_private.report_links set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=$1",
      [linkId],
    );
    await guest.reload();
    await expect(
      guest.getByRole("heading", { name: "Link nije dostupan" }),
    ).toBeVisible();
    await expect(guest.getByRole("article")).toHaveCount(0);
    expect((await guest.request.get(`/r/${token}/pdf`)).status()).toBe(404);
    expect((await guest.request.get(photoUrl!)).status()).toBe(404);
    expect(
      (
        await capability.storage
          .from("report-pdfs")
          .download(archived.data.artifact.path)
      ).data,
    ).toBeNull();
    await page.reload();
    await expect(
      page.getByText("Link 1 · Istekao", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Napravi link za klijenta" })
      .click();
    await expect(copy).toBeVisible();
    const secondUrl = await copy.inputValue(),
      secondToken = new URL(secondUrl).pathname.split("/").at(-1)!;
    expect(secondToken).not.toBe(token);
    await guest.goto(secondUrl);
    await expect(guest.getByRole("article")).toBeVisible();
    await page
      .getByRole("button", { name: "Opozovi link", exact: true })
      .click();
    await expect(
      page.getByText("Link 2 · Opozvan", { exact: true }),
    ).toBeVisible();
    await expect(copy).toHaveCount(0);
    await guest.reload();
    await expect(
      guest.getByRole("heading", { name: "Link nije dostupan" }),
    ).toBeVisible();
    expect((await guest.request.get(`/r/${secondToken}/pdf`)).status()).toBe(
      404,
    );
    expect(
      (
        await guest.request.get(
          `/r/${secondToken}/photos/${before.items[0].photos[0].id}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await api(secondToken)
          .storage.from("report-pdfs")
          .download(archived.data.artifact.path)
      ).data,
    ).toBeNull();
    await guest.goto(`/r/${randomBytes(32).toString("base64url")}`);
    await expect(
      guest.getByRole("heading", { name: "Link nije dostupan" }),
    ).toBeVisible();
    await expect(guest.getByRole("article")).toHaveCount(0);
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await Promise.all(
      [owner, ...others].map((c) => c.auth.signOut({ scope: "local" })),
    );
    await guestContext.close();
    await cleanupPhoto();
    await fixture.dispose();
    await otherFixture.dispose();
  }
});
function hashBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
