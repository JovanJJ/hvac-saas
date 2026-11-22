import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
import {
  executeMaintenance,
  type MaintenanceClaim,
} from "../src/worker/maintenance";
import { shiftDate } from "../features/scheduling/model";
async function api(email = "owner.a@hvac.example.invalid") {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email,
        password: process.env.SEED_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  return client;
}
async function login(page: Page, email = "owner.a@hvac.example.invalid") {
  await page.goto("/sign-in");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today)$/);
}
async function runWorker(planId: string) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/worker/main.ts", "--plan", planId, "--once"],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (output += chunk.toString()));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  expect(code, output).toBe(0);
  return output;
}
async function crashAfterClaim(planId: string): Promise<MaintenanceClaim> {
  const file = `/tmp/hvac-claim-${randomUUID()}.mjs`;
  await writeFile(
    file,
    `import {workerClient} from ${JSON.stringify(pathToFileURL(process.cwd() + "/src/worker/client.ts").href)};import {claimMaintenance} from ${JSON.stringify(pathToFileURL(process.cwd() + "/src/worker/maintenance.ts").href)};const client=await workerClient();const job=await claimMaintenance(client,process.argv[2]);process.send(job);setInterval(()=>{},1000);`,
  );
  const child = spawn(process.execPath, ["--import", "tsx", file, planId], {
    env: process.env,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  try {
    return await new Promise<MaintenanceClaim>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Claim fixture timed out")),
        20000,
      );
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("message", (message) => {
        clearTimeout(timer);
        resolve(message as MaintenanceClaim);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code !== null && code !== 0)
          reject(new Error("Claim fixture exited"));
      });
    });
  } finally {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await stopped;
    await unlink(file);
  }
}
async function createPlan(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
  owner: Awaited<ReturnType<typeof api>>,
) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Belgrade",
  });
  const roster = await owner.rpc("workspace_roster", {
    p_organization_id: fixture.org,
  });
  const tech = roster.data.find(
    (m: { email: string }) => m.email === "technician.a@hvac.example.invalid",
  ).membership_id;
  const id = randomUUID();
  const input = {
    siteId: fixture.siteId,
    name: "Fiktivan plan ponavljanja",
    anchorDate: today,
    anchorTime: "08:30",
    timeZone: "Europe/Belgrade",
    intervalMonths: 1,
    durationMinutes: 60,
    systems: fixture.systemIds.slice(0, 2),
    members: [tech],
  };
  expect(
    (
      await owner.rpc("maintenance_plan_command", {
        p_organization_id: fixture.org,
        p_plan_id: id,
        p_operation_id: randomUUID(),
        p_kind: "create",
        p_version: 0,
        p_data: input,
      })
    ).error,
  ).toBeNull();
  return { id, today, input };
}
async function cleanup(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  const ids = (
    await fixture.db.query(
      "select id from public.maintenance_plans where organization_id=$1 and site_id=$2",
      [fixture.org, fixture.siteId],
    )
  ).rows.map((x) => x.id);
  const visits = (
    await fixture.db.query(
      "select visit_id id from public.maintenance_occurrences where organization_id=$1 and plan_id=any($2::uuid[])",
      [fixture.org, ids],
    )
  ).rows.map((x) => x.id);
  await fixture.db.query(
    "delete from public.maintenance_occurrences where organization_id=$1 and plan_id=any($2::uuid[])",
    [fixture.org, ids],
  );
  await fixture.db.query(
    "delete from hvac_private.schedule_events where organization_id=$1 and visit_id=any($2::uuid[])",
    [fixture.org, visits],
  );
  await fixture.db.query(
    "delete from hvac_private.operation_receipts where organization_id=$1 and payload->>'visit'=any($2::text[])",
    [fixture.org, visits],
  );
  for (const table of ["visit_items", "visit_assignees"])
    await fixture.db.query(
      `delete from public.${table} where organization_id=$1 and visit_id=any($2::uuid[])`,
      [fixture.org, visits],
    );
  await fixture.db.query(
    "delete from public.visits where organization_id=$1 and id=any($2::uuid[])",
    [fixture.org, visits],
  );
  await fixture.db.query(
    "delete from hvac_private.maintenance_generation_receipts where organization_id=$1 and job_id in(select id from hvac_private.maintenance_jobs where organization_id=$1 and plan_id=any($2::uuid[]))",
    [fixture.org, ids],
  );
  for (const table of [
    "hvac_private.maintenance_jobs",
    "hvac_private.maintenance_events",
    "public.plan_systems",
    "public.maintenance_plan_assignees",
  ])
    await fixture.db.query(
      `delete from ${table} where organization_id=$1 and plan_id=any($2::uuid[])`,
      [fixture.org, ids],
    );
  await fixture.db.query(
    "delete from public.maintenance_plans where organization_id=$1 and id=any($2::uuid[])",
    [fixture.org, ids],
  );
  await fixture.db.query(
    "delete from hvac_private.register_events where organization_id=$1 and entity_id=any($2::uuid[])",
    [fixture.org, fixture.systemIds],
  );
  await fixture.dispose();
}
test("two worker processes generate once, reclaim a killed worker and preserve fieldwork and issued PDF after plan changes", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const fixture = await createReportFixture();
  const field = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  let worker: Awaited<ReturnType<typeof workerClient>> | undefined;
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const issue = await owner.rpc("issue_report", {
      ...scoped,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issue.error).toBeNull();
    worker = await workerClient();
    const pdfJob = await claimJob(worker, issue.data);
    expect(pdfJob).not.toBeNull();
    await processJob(worker, pdfJob!);
    const frozen = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: issue.data,
    });
    const bytes = await owner.storage
      .from("report-pdfs")
      .download(frozen.data.artifact.path);
    expect(bytes.error).toBeNull();
    const hash = (value: Buffer) =>
      createHash("sha256").update(value).digest("hex");
    const originalHash = hash(Buffer.from(await bytes.data!.arrayBuffer()));
    const plan = await createPlan(fixture, owner);
    await login(page);
    await page.goto(`/maintenance/${plan.id}`);
    const section = page.getByRole("region", { name: "Generisanje poseta" });
    await section
      .getByRole("button", { name: "Pripremi posete", exact: true })
      .click();
    await expect(section).toContainText("Zahtev je sačuvan.");
    const logs = await Promise.all([runWorker(plan.id), runWorker(plan.id)]);
    expect(logs.join("").match(/"state":"ready"/g)).toHaveLength(1);
    await section
      .getByRole("button", { name: "Osveži rezultat pripreme" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await owner.rpc("maintenance_generation_state", {
              ...scoped,
              p_plan_id: plan.id,
            })
          ).data.totalVisits,
      )
      .toBeGreaterThan(0);
    let state = (
      await owner.rpc("maintenance_generation_state", {
        ...scoped,
        p_plan_id: plan.id,
      })
    ).data;
    const committed = (
      await fixture.db.query(
        "select id,lease_token,attempts from hvac_private.maintenance_jobs where organization_id=$1 and plan_id=$2 and state='ready' order by created_at limit 1",
        [fixture.org, plan.id],
      )
    ).rows[0];
    const committedClaim = {
      jobId: committed.id,
      planId: plan.id,
      organizationId: fixture.org,
      leaseToken: committed.lease_token,
      attempts: committed.attempts,
    };
    expect(await executeMaintenance(worker, committedClaim)).toEqual(
      await executeMaintenance(worker, committedClaim),
    );
    const initial = state.visits;
    expect(new Set(initial.map((v: { id: string }) => v.id)).size).toBe(
      initial.length,
    );
    const todayVisit = initial.find(
      (v: { intendedDate: string }) => v.intendedDate === plan.today,
    );
    expect(todayVisit).toBeTruthy();
    const tech = await api("technician.a@hvac.example.invalid");
    const bundle = (
      await tech.rpc("visit_bundle", { ...scoped, p_visit_id: todayVisit.id })
    ).data;
    expect(bundle.items).toHaveLength(2);
    expect(bundle.planId).toBe(plan.id);
    expect(
      (
        await tech.rpc("visit_command", {
          ...scoped,
          p_visit_id: todayVisit.id,
          p_operation_id: randomUUID(),
          p_kind: "save",
          p_version: bundle.version,
          p_data: {
            itemId: bundle.items[0].id,
            outcome: "serviced",
            work: "Fiktivan rad iz ponavljanja",
            finding: "",
            readings: [],
            parts: [],
          },
        })
      ).error,
    ).toBeNull();
    const entered = (
      await tech.rpc("visit_bundle", { ...scoped, p_visit_id: todayVisit.id })
    ).data;
    expect(entered.items[0].enteredBy).toBe(
      "a1000000-0000-4000-8000-000000000102",
    );
    const fieldPage = await field.newPage();
    await login(fieldPage, "technician.a@hvac.example.invalid");
    await fieldPage.getByRole("link", { name: "Danas", exact: true }).click();
    await expect(
      fieldPage.locator(`a[href="/visits/${todayVisit.id}"]`),
    ).toBeVisible();
    await fieldPage.locator(`a[href="/visits/${todayVisit.id}"]`).click();
    await expect(
      fieldPage.getByText("Fiktivan rad iz ponavljanja", { exact: true }),
    ).toBeVisible();
    // Kill an actual process after it claims, expire only that fixture lease, then restart.
    expect(
      (
        await owner.rpc("maintenance_generation_command", {
          ...scoped,
          p_plan_id: plan.id,
          p_operation_id: randomUUID(),
          p_kind: "generate",
          p_version: 1,
          p_data: {
            from: shiftDate(plan.today, 60),
            until: shiftDate(plan.today, 149),
          },
        })
      ).error,
    ).toBeNull();
    const abandoned = await crashAfterClaim(plan.id);
    expect(abandoned.jobId).toBeTruthy();
    await fixture.db.query(
      "update hvac_private.maintenance_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [abandoned.jobId],
    );
    await runWorker(plan.id);
    expect(
      (
        await worker.rpc("maintenance_execute", {
          p_job_id: abandoned.jobId,
          p_lease_token: abandoned.leaseToken,
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      (
        await owner.rpc("maintenance_generation_state", {
          ...scoped,
          p_plan_id: plan.id,
        })
      ).data.jobs.find((j: { id: string }) => j.id === abandoned.jobId)
        .attempts,
    ).toBe(2);
    const oldRows = (
      await fixture.db.query(
        "select to_jsonb(v) data from public.visits v where id=any($1::uuid[]) order by id",
        [initial.map((v: { id: string }) => v.id)],
      )
    ).rows;
    expect(
      (
        await owner.rpc("maintenance_plan_command", {
          ...scoped,
          p_plan_id: plan.id,
          p_operation_id: randomUUID(),
          p_kind: "edit",
          p_version: 1,
          p_data: {
            ...plan.input,
            durationMinutes: 120,
            systems: plan.input.systems.slice(0, 1),
          },
        })
      ).error,
    ).toBeNull();
    await runWorker(plan.id);
    expect(
      (
        await fixture.db.query(
          "select to_jsonb(v) data from public.visits v where id=any($1::uuid[]) order by id",
          [initial.map((v: { id: string }) => v.id)],
        )
      ).rows,
    ).toEqual(oldRows);
    expect(
      (await tech.rpc("visit_bundle", { ...scoped, p_visit_id: todayVisit.id }))
        .data.items,
    ).toEqual(entered.items);
    state = (
      await owner.rpc("maintenance_generation_state", {
        ...scoped,
        p_plan_id: plan.id,
      })
    ).data;
    const cancellable = state.visits.find(
      (v: { id: string; status: string }) =>
        v.id !== todayVisit.id && v.status === "scheduled",
    );
    expect(cancellable).toBeTruthy();
    expect(
      (
        await owner.rpc("schedule_visit_command", {
          ...scoped,
          p_visit_id: cancellable.id,
          p_operation_id: randomUUID(),
          p_kind: "cancel",
          p_version: 1,
          p_data: { reason: "Fiktivno otkazivanje ponavljanja" },
        })
      ).error,
    ).toBeNull();
    const total = state.totalVisits;
    expect(
      (
        await owner.rpc("maintenance_generation_command", {
          ...scoped,
          p_plan_id: plan.id,
          p_operation_id: randomUUID(),
          p_kind: "generate",
          p_version: 2,
          p_data: {
            from: shiftDate(plan.today, 1),
            until: shiftDate(plan.today, 89),
          },
        })
      ).error,
    ).toBeNull();
    await runWorker(plan.id);
    state = (
      await owner.rpc("maintenance_generation_state", {
        ...scoped,
        p_plan_id: plan.id,
      })
    ).data;
    expect(state.totalVisits).toBe(total);
    expect(
      state.visits.find((v: { id: string }) => v.id === cancellable.id).status,
    ).toBe("cancelled");
    await page.reload();
    await section
      .getByText("Poslednji zahtevi za pripremu", { exact: true })
      .click();
    await expect(
      section.getByRole("link", {
        name: `Poseta · ${plan.today}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("generated-visits.png"),
      fullPage: true,
    });
    await page.goto(`/schedule?date=${plan.today}`);
    await expect(
      page.locator(`a[href="/maintenance/${plan.id}"]`),
    ).toBeVisible();
    expect(
      (
        await owner.rpc("report_revision", {
          ...scoped,
          p_revision_id: issue.data,
        })
      ).data,
    ).toEqual(frozen.data);
    const after = await owner.storage
      .from("report-pdfs")
      .download(frozen.data.artifact.path);
    expect(after.error).toBeNull();
    expect(hash(Buffer.from(await after.data!.arrayBuffer()))).toBe(
      originalHash,
    );
  } finally {
    worker?.auth.stopAutoRefresh();
    await field.close();
    await cleanup(fixture);
  }
});
test("office sees failed preparation, retries the same job across failures and field/other-tenant callers are denied", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const fixture = await createReportFixture({ submitted: false });
  try {
    const owner = await api(),
      scoped = { p_organization_id: fixture.org };
    const plan = await createPlan(fixture, owner);
    await runWorker(plan.id);
    const queued = await owner.rpc("maintenance_generation_command", {
      ...scoped,
      p_plan_id: plan.id,
      p_operation_id: randomUUID(),
      p_kind: "generate",
      p_version: 1,
      p_data: {
        from: shiftDate(plan.today, 200),
        until: shiftDate(plan.today, 220),
      },
    });
    expect(queued.error).toBeNull();
    expect(
      (
        await owner.rpc("register_command", {
          ...scoped,
          p_entity_id: fixture.systemIds[0],
          p_operation_id: randomUUID(),
          p_kind: "system.archive",
          p_version: 1,
          p_data: {},
        })
      ).error,
    ).toBeNull();
    await runWorker(plan.id);
    await login(page);
    await page.goto(`/maintenance/${plan.id}`);
    const section = page.getByRole("region", { name: "Generisanje poseta" });
    await section
      .getByText("Poslednji zahtevi za pripremu", { exact: true })
      .click();
    const job = section.locator(`[data-job-id="${queued.data}"]`);
    await expect(job).toContainText("Priprema nije uspela");
    await page.screenshot({
      path: info.outputPath("failed-preparation.png"),
      fullPage: true,
    });
    await job
      .getByRole("button", { name: "Ponovi pripremu", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await owner.rpc("maintenance_generation_state", {
              ...scoped,
              p_plan_id: plan.id,
            })
          ).data.jobs.find((j: { id: string }) => j.id === queued.data).state,
      )
      .toBe("queued");
    await runWorker(plan.id);
    await section
      .getByRole("button", { name: "Osveži rezultat pripreme" })
      .click();
    await expect(job).toContainText("Priprema nije uspela");
    expect(
      (
        await owner.rpc("register_command", {
          ...scoped,
          p_entity_id: fixture.systemIds[0],
          p_operation_id: randomUUID(),
          p_kind: "system.restore",
          p_version: 2,
          p_data: {},
        })
      ).error,
    ).toBeNull();
    await job
      .getByRole("button", { name: "Ponovi pripremu", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await owner.rpc("maintenance_generation_state", {
              ...scoped,
              p_plan_id: plan.id,
            })
          ).data.jobs.find((j: { id: string }) => j.id === queued.data).state,
      )
      .toBe("queued");
    await runWorker(plan.id);
    await section
      .getByRole("button", { name: "Osveži rezultat pripreme" })
      .click();
    await expect(job).toContainText("Završeno");
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.maintenance_generation_receipts where organization_id=$1 and job_id=$2 and payload->>'kind'='retry'",
          [fixture.org, queued.data],
        )
      ).rows[0].n,
    ).toBe(2);
    for (const email of [
      "owner.b@hvac.example.invalid",
      "technician.a@hvac.example.invalid",
      "unassigned@hvac.example.invalid",
    ]) {
      const outsider = await api(email);
      expect(
        (
          await outsider.rpc("maintenance_generation_state", {
            ...scoped,
            p_plan_id: plan.id,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await outsider.rpc("maintenance_generation_command", {
            ...scoped,
            p_plan_id: plan.id,
            p_operation_id: randomUUID(),
            p_kind: "retry",
            p_version: 1,
            p_data: { jobId: queued.data },
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (await outsider.rpc("maintenance_claim", { p_plan_id: plan.id })).error
          ?.code,
      ).toBe("42501");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await cleanup(fixture);
  }
});
