import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createReportFixture } from "../tests/report-fixture";
const execute = promisify(execFile);
const image = process.env.REPORT_WORKER_IMAGE || "hvac-report-worker:m3c";
async function main() {
  const fixture = await createReportFixture();
  const owner = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    assert.equal(
      (
        await owner.auth.signInWithPassword({
          email: "owner.a@hvac.example.invalid",
          password: process.env.SEED_PASSWORD!,
        })
      ).error,
      null,
    );
    const issued = await owner.rpc("issue_report", {
      p_organization_id: fixture.org,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    assert.equal(issued.error, null);
    const names = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "REPORT_WORKER_EMAIL",
      "REPORT_WORKER_PASSWORD",
      "CLOUDINARY_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      PATH: process.env.PATH,
      ...Object.fromEntries(
        names.map((name) => [name, process.env[name] || ""]),
      ),
    };
    env.SUPABASE_PUBLISHABLE_KEY =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.SUPABASE_PUBLISHABLE_KEY;
    const args = [
      "run",
      "--rm",
      "--network",
      "host",
      "--init",
      "--shm-size",
      "256m",
      "--memory",
      "1g",
      ...names.flatMap((name) => ["--env", name]),
      image,
    ];
    const uid = await execute(
      "docker",
      [
        ...args,
        "node",
        "-e",
        "if(process.getuid()===0 || process.env.DATABASE_URL || process.env.STORAGE_MAINTENANCE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)process.exit(1);console.log('non-root isolated runtime')",
      ],
      { env },
    );
    assert.match(uid.stdout, /non-root/);
    await execute(
      "docker",
      [
        ...args,
        "node",
        "--import",
        "tsx",
        "src/worker/main.ts",
        "--once",
        "--revision",
        issued.data,
      ],
      { env, timeout: 120000, maxBuffer: 100000 },
    );
    const first = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: issued.data,
    });
    assert.equal(first.error, null);
    assert.equal(first.data.renderState, "ready");
    await execute(
      "docker",
      [
        ...args,
        "node",
        "--import",
        "tsx",
        "src/worker/main.ts",
        "--once",
        "--revision",
        issued.data,
      ],
      { env, timeout: 120000, maxBuffer: 100000 },
    );
    const second = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: issued.data,
    });
    assert.equal(second.data.artifact.sha256, first.data.artifact.sha256);
    console.log(
      "PASS: non-root worker container archived one private PDF; second process preserved its digest.",
    );
  } finally {
    await owner.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
}
main().catch(() => {
  console.error(
    "Worker container verification failed. No credentials were logged.",
  );
  process.exitCode = 1;
});
