import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
import { photoSources } from "../src/worker/photos";
import { attachFictionalReportPhoto } from "./pdf-photo-fixture";
import { digest, renderReport } from "../src/worker/render";
function api() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function staff(email: string) {
  const c = api();
  expect(
    (
      await c.auth.signInWithPassword({
        email,
        password: process.env.SEED_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  return c;
}

test("leased PDF recovers uploaded bytes, enforces private access and supports office retry", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture();
  const owner = await staff("owner.a@hvac.example.invalid");
  const worker = await workerClient();
  const others = [];
  try {
    const issued = await owner.rpc("issue_report", {
      p_organization_id: fixture.org,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const revisionId = issued.data as string;
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/office/reports/${revisionId}`);
    await expect(
      page.getByRole("status").filter({ hasText: "Čeka izradu PDF-a" }),
    ).toBeVisible();
    expect(
      (
        await page.request.get(`/api/office/reports/${revisionId}/pdf`)
      ).status(),
    ).toBe(409);
    const [a, b] = await Promise.all([
      claimJob(worker, revisionId),
      claimJob(worker, revisionId),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const claim = a || b;
    expect(claim).not.toBeNull();
    await expect(
      processJob(worker, claim!, {
        afterUpload: async () => {
          throw new Error("simulated_process_exit");
        },
      }),
    ).rejects.toThrow("simulated_process_exit");
    const stored = await worker.storage
      .from("report-pdfs")
      .download(claim!.path);
    expect(stored.error).toBeNull();
    const before = Buffer.from(await stored.data!.arrayBuffer());
    expect(
      (await owner.storage.from("report-pdfs").download(claim!.path)).data,
    ).toBeNull();
    // A stale token cannot heartbeat or complete after another lease takes over.
    await fixture.db.query(
      "update hvac_private.render_jobs set lease_until=now()-interval '1 second' where revision_id=$1",
      [revisionId],
    );
    const recovered = await claimJob(worker, revisionId);
    expect(recovered!.jobId).toBe(claim!.jobId);
    expect(
      (
        await worker.rpc("pdf_heartbeat", {
          p_job_id: claim!.jobId,
          p_lease_token: claim!.leaseToken,
        })
      ).error?.code,
    ).toBe("PT409");
    await processJob(worker, recovered!);
    const revision = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: revisionId,
    });
    expect(revision.error).toBeNull();
    expect(revision.data.renderState).toBe("ready");
    expect(revision.data.artifact.sha256).toBe(digest(before));
    expect(await claimJob(worker, revisionId)).toBeNull();
    const archived = await owner.storage
      .from("report-pdfs")
      .download(claim!.path);
    expect(archived.error).toBeNull();
    expect(digest(Buffer.from(await archived.data!.arrayBuffer()))).toBe(
      digest(before),
    );
    for (const c of [owner, worker]) {
      expect(
        (
          await c.storage
            .from("report-pdfs")
            .upload(claim!.path, Buffer.from("replace"), {
              contentType: "application/pdf",
              upsert: true,
            })
        ).error,
      ).not.toBeNull();
      await c.storage.from("report-pdfs").remove([claim!.path]);
    }
    expect(
      (await owner.storage.from("report-pdfs").download(claim!.path)).error,
    ).toBeNull();
    expect(
      (
        await owner.rpc("retry_report", {
          p_organization_id: fixture.org,
          p_revision_id: revisionId,
          p_operation_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    await fixture.db.query(
      "update public.customers set name='CHANGED AFTER ISSUE' where id=$1",
      [fixture.customerId],
    );
    await expect(
      page.getByRole("link", { name: "Preuzmi PDF", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const downloaded = await page.request.get(
      `/api/office/reports/${revisionId}/pdf`,
    );
    expect(downloaded.status()).toBe(200);
    expect(digest(await downloaded.body())).toBe(digest(before));
    expect(downloaded.headers()["cache-control"]).toBe("private, no-store");
    await expect(page.getByRole("article")).not.toContainText(
      "CHANGED AFTER ISSUE",
    );
    await page.screenshot({
      path: info.outputPath("pdf-ready.png"),
      fullPage: true,
    });
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const c = await staff(email);
      others.push(c);
      expect(
        (await c.storage.from("report-pdfs").download(claim!.path)).data,
      ).toBeNull();
      expect(
        (await c.rpc("pdf_claim", { p_revision_id: revisionId })).error?.code,
      ).toBe("42501");
      expect(
        (
          await c.rpc("pdf_complete", {
            p_job_id: claim!.jobId,
            p_lease_token: recovered!.leaseToken,
            p_sha256: digest(before),
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await c.rpc("retry_report", {
            p_organization_id: fixture.org,
            p_revision_id: revisionId,
            p_operation_id: randomUUID(),
          })
        ).error?.code,
      ).toBe("42501");
      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByLabel("Email adresa").fill(email);
      await page
        .getByLabel("Lozinka", { exact: true })
        .fill(process.env.SEED_PASSWORD!);
      await page
        .getByRole("button", { name: "Prijavi se", exact: true })
        .click();
      await expect(page).toHaveURL(/\/(office|today|onboarding)$/);
      expect(
        (
          await page.request.get(`/api/office/reports/${revisionId}/pdf`)
        ).status(),
      ).toBe(404);
    }
    await page.context().clearCookies();
    expect(
      (
        await page.request.get(`/api/office/reports/${revisionId}/pdf`)
      ).status(),
    ).toBe(401);
    const anonymous = api();
    expect(
      (await anonymous.storage.from("report-pdfs").download(claim!.path)).data,
    ).toBeNull();
    expect(
      (await anonymous.rpc("pdf_claim", { p_revision_id: revisionId })).error,
    ).not.toBeNull();
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.report_artifacts where revision_id=$1",
          [revisionId],
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await Promise.all(
      [owner, ...others].map((c) => c.auth.signOut({ scope: "local" })),
    );
    await fixture.dispose();
  }
});

test("bounded failures and idempotent manual retry keep the same revision and job", async ({
  page,
}) => {
  test.setTimeout(90000);
  const fixture = await createReportFixture();
  const owner = await staff("owner.a@hvac.example.invalid");
  const worker = await workerClient();
  try {
    const issued = await owner.rpc("issue_report", {
      p_organization_id: fixture.org,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const id = issued.data as string;
    let jobId = "";
    for (let i = 1; i <= 3; i++) {
      const job = await claimJob(worker, id);
      expect(job!.attempts).toBe(i);
      jobId = job!.jobId;
      expect(
        (
          await worker.rpc("pdf_fail", {
            p_job_id: jobId,
            p_lease_token: job!.leaseToken,
            p_error: "render_failed",
          })
        ).error,
      ).toBeNull();
      await fixture.db.query(
        "update hvac_private.render_jobs set available_at=now() where revision_id=$1",
        [id],
      );
    }
    expect(await claimJob(worker, id)).toBeNull();
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/office/reports/${id}`);
    await expect(
      page.getByRole("status").filter({ hasText: "nije uspela" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ponovi izradu PDF-a" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Čeka izradu" }),
    ).toBeVisible();
    const retry = await claimJob(worker, id);
    expect(retry!.jobId).toBe(jobId);
    expect(retry!.attempts).toBe(1);
    const receipt = (
      await fixture.db.query(
        "select operation_id from hvac_private.report_retry_receipts where revision_id=$1",
        [id],
      )
    ).rows[0];
    expect(
      (
        await owner.rpc("retry_report", {
          p_organization_id: fixture.org,
          p_revision_id: id,
          p_operation_id: receipt.operation_id,
        })
      ).error,
    ).toBeNull();
    expect(await claimJob(worker, id)).toBeNull();
    await processJob(worker, retry!);
    await expect(page.getByRole("link", { name: "Preuzmi PDF" })).toBeVisible({
      timeout: 15000,
    });
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await owner.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
});

test("one, four and thirty systems render deterministic searchable archived PDFs", async ({}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Print layout is viewport independent",
  );
  test.setTimeout(180000);
  const owner = await staff("owner.a@hvac.example.invalid");
  const worker = await workerClient();
  try {
    for (const systemCount of [1, 4, 30]) {
      const fixture = await createReportFixture({ systemCount });
      let cleanupPhoto: (() => Promise<void>) | undefined;
      try {
        if (systemCount === 4)
          cleanupPhoto = await attachFictionalReportPhoto(fixture);
        const issued = await owner.rpc("issue_report", {
          p_organization_id: fixture.org,
          p_visit_id: fixture.visitId,
          p_operation_id: randomUUID(),
          p_version: fixture.version,
        });
        expect(issued.error).toBeNull();
        const claim = await claimJob(worker, issued.data as string);
        expect(claim).not.toBeNull();
        const sources = await photoSources(claim!.data, fixture.org);
        const first = await renderReport(claim!.data, sources);
        const second = await renderReport(claim!.data, sources);
        expect(digest(first)).toBe(digest(second));
        await processJob(worker, claim!);
        const stored = await owner.storage
          .from("report-pdfs")
          .download(claim!.path);
        expect(stored.error).toBeNull();
        const bytes = Buffer.from(await stored.data!.arrayBuffer());
        expect(digest(bytes)).toBe(digest(first));
        await mkdir("/tmp/hvac-pdf-review", { recursive: true });
        await writeFile(
          `/tmp/hvac-pdf-review/${systemCount}-systems.pdf`,
          bytes,
        );
        await writeFile(
          `/tmp/hvac-pdf-review/${systemCount}-systems.json`,
          JSON.stringify({
            reference: claim!.data.reference,
            totals: claim!.data.totals,
            sha256: digest(bytes),
          }),
        );
      } finally {
        await cleanupPhoto?.();
        await fixture.dispose();
      }
    }
  } finally {
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await owner.auth.signOut({ scope: "local" });
  }
});
