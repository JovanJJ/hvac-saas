import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
test("explicit guest receipt is immutable, replay-safe, revision-bound and visible to office", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const fixture = await createReportFixture(),
    owner = api(),
    worker = await workerClient(),
    others = [];
  const guestContext = await browser.newContext({
      viewport: info.project.use.viewport,
    }),
    guest = await guestContext.newPage();
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";
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
    const revisionId = issued.data as string;
    const job = await claimJob(worker, revisionId);
    expect(job).not.toBeNull();
    await processJob(worker, job!);
    async function link() {
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
    const first = await link();
    const payload = {
      name: "Mila Đurić",
      role: "Upravnik objekta",
      acknowledged: true,
    };
    const post = (token: string, data: unknown, requestOrigin = origin) =>
      guest.request.post(`/r/${token}/receipt`, {
        data,
        headers: { origin: requestOrigin },
      });
    async function count() {
      return (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.report_receipts where revision_id=$1",
          [revisionId],
        )
      ).rows[0].n;
    }
    async function businessState() {
      return (
        await fixture.db.query(
          "select to_jsonb(v) visit,(select jsonb_agg(to_jsonb(i) order by i.id) from public.visit_items i where i.visit_id=v.id) items,(select jsonb_agg(to_jsonb(f) order by f.item_id) from public.follow_ups f join public.visit_items i on i.id=f.item_id where i.visit_id=v.id) actions,(select snapshot from public.report_revisions where id=$2) snapshot from public.visits v where v.id=$1",
          [fixture.visitId, revisionId],
        )
      ).rows[0];
    }
    const before = await businessState();
    await guest.goto(`/r/${first.token}`);
    const region = guest.getByRole("region", {
      name: "Potvrda prijema",
      exact: true,
    });
    await expect(region).toBeVisible();
    await expect(guest.getByRole("article").getByRole("definition")).toHaveText(
      ["4", "3", "2"],
    );
    const pdf = await guest.request.get(`/r/${first.token}/pdf`);
    expect(pdf.status()).toBe(200);
    const pdfHash = hash(await pdf.body());
    expect(await count()).toBe(0);
    for (const data of [
      { ...payload, acknowledged: false },
      { ...payload, name: " " },
      { ...payload, role: "" },
      { ...payload, name: "x".repeat(121) },
    ])
      expect((await post(first.token, data)).status()).toBe(422);
    expect(
      (
        await post(first.token, payload, "https://untrusted.example.invalid")
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(first.token, { ...payload, name: "x".repeat(5000) })
      ).status(),
    ).toBe(413);
    expect(
      (await post(randomBytes(32).toString("base64url"), payload)).status(),
    ).toBe(404);
    expect(await count()).toBe(0);
    await region
      .getByLabel("Ime i prezime", { exact: true })
      .fill(payload.name);
    await region
      .getByLabel("Uloga kod klijenta", { exact: true })
      .fill(payload.role);
    await region
      .getByRole("button", { name: "Potvrdi prijem izveštaja" })
      .click();
    expect(await count()).toBe(0);
    await region.getByRole("checkbox").check();
    await region.screenshot({ path: info.outputPath("receipt-form.png") });
    await region
      .getByRole("button", { name: "Potvrdi prijem izveštaja" })
      .click();
    await expect(region.getByRole("status")).toContainText(
      "Prijem je potvrđen.",
    );
    await expect(region).toContainText(payload.name);
    await expect(region.getByRole("button")).toHaveCount(0);
    expect(await count()).toBe(1);
    await guest.reload();
    await expect(region.getByRole("status")).toContainText(payload.role);
    await region.screenshot({ path: info.outputPath("receipt-confirmed.png") });
    const replay = await post(first.token, {
      ...payload,
      revisionId: randomUUID(),
    });
    expect(replay.status()).toBe(200);
    const receipt = (await replay.json()).receipt;
    expect(receipt.revisionId).toBe(revisionId);
    expect(receipt.linkId).toBe(first.id);
    expect(Number.isFinite(Date.parse(receipt.confirmedAt))).toBe(true);
    const twice = await Promise.all([
      post(first.token, payload),
      post(first.token, payload),
    ]);
    for (const response of twice) {
      expect(response.status()).toBe(200);
      expect((await response.json()).receipt).toEqual(receipt);
    }
    expect(
      (await post(first.token, { ...payload, name: "Changed" })).status(),
    ).toBe(409);
    expect(await count()).toBe(1);
    const second = await link(),
      anonymous = api();
    expect(
      (await anonymous.rpc("guest_report", { p_token: second.token })).data
        .receipt,
    ).toBeNull();
    const nextPayload = {
      name: "Nenad Čačić",
      role: "Rukovodilac",
      acknowledged: true,
    };
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/office/reports/${revisionId}`);
    const office = page.getByRole("region", {
      name: "Evidencija prijema",
      exact: true,
    });
    await expect(office).toContainText(payload.name);
    const competing = await Promise.all([
      post(second.token, nextPayload),
      post(second.token, nextPayload),
    ]);
    const results = [];
    for (const response of competing) {
      expect(response.status()).toBe(200);
      results.push((await response.json()).receipt);
    }
    expect(results[0]).toEqual(results[1]);
    expect(await count()).toBe(2);
    await office.getByRole("button", { name: "Osveži potvrde" }).click();
    await expect(office).toContainText(nextPayload.name);
    await office.screenshot({ path: info.outputPath("receipt-office.png") });
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
          await c.rpc("report_receipts", {
            p_organization_id: fixture.org,
            p_revision_id: revisionId,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await c.rpc("acknowledge_report", {
            p_token: revisionId,
            p_name: "No",
            p_role: "No",
            p_acknowledged: true,
          })
        ).error?.code,
      ).toBe("42501");
    }
    const expired = await link();
    await fixture.db.query(
      "update hvac_private.report_links set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=$1",
      [expired.id],
    );
    expect((await post(expired.token, payload)).status()).toBe(404);
    const revoked = await link();
    expect(
      (
        await owner.rpc("revoke_report_link", {
          p_organization_id: fixture.org,
          p_link_id: revoked.id,
        })
      ).error,
    ).toBeNull();
    expect((await post(revoked.token, payload)).status()).toBe(404);
    expect(
      (
        await owner.rpc("revoke_report_link", {
          p_organization_id: fixture.org,
          p_link_id: first.id,
        })
      ).error,
    ).toBeNull();
    expect((await post(first.token, payload)).status()).toBe(404);
    await guest.reload();
    await expect(
      guest.getByRole("heading", { name: "Link nije dostupan" }),
    ).toBeVisible();
    await expect(
      guest.getByRole("region", { name: "Potvrda prijema" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(office).toContainText(payload.name);
    expect(await count()).toBe(2);
    expect(await businessState()).toEqual(before);
    const unchanged = await guest.request.get(`/r/${second.token}/pdf`);
    expect(unchanged.status()).toBe(200);
    expect(hash(await unchanged.body())).toBe(pdfHash);
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await Promise.all(
      [owner, ...others].map((c) => c.auth.signOut({ scope: "local" })),
    );
    await guestContext.close();
    await fixture.dispose();
  }
});
