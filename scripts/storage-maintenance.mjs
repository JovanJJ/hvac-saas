// SQL/Storage administration for provisioning and explicit test cleanup only.
// Never import this module from the app or worker runtime.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const execute = promisify(execFile);
export async function installReportPolicies(installationId, sql) {
  if (!/^[a-f0-9-]{36}$/i.test(installationId))
    throw new Error("Invalid installation identity");
  const guarded = `begin; do $$ begin if not exists(select 1 from hvac_private.pdf_worker_identity where installation_id='${installationId}'::uuid) then raise exception 'wrong_storage_database';end if;end $$;\n${sql}\ncommit;`;
  if (process.env.STORAGE_ADMIN_DATABASE_URL) {
    const db = new pg.Client({
      connectionString: process.env.STORAGE_ADMIN_DATABASE_URL,
    });
    await db.connect();
    try {
      await db.query(guarded);
    } finally {
      await db.end();
    }
  } else {
    await new Promise((resolve, reject) => {
      const child = execFile(
        "docker",
        [
          "exec",
          "-i",
          process.env.SUPABASE_DB_CONTAINER || "supabase-db",
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        (error) =>
          error
            ? reject(new Error("Storage policy installation failed"))
            : resolve(),
      );
      child.stdin.end(guarded);
    });
  }
}
export async function storageMaintenanceClient() {
  let key = process.env.STORAGE_MAINTENANCE_KEY;
  if (!key) {
    const { stdout } = await execute("docker", [
      "inspect",
      process.env.SUPABASE_STORAGE_CONTAINER || "supabase-storage",
    ]);
    const info = JSON.parse(stdout);
    const setting = info[0]?.Config?.Env?.find((value) =>
      value.startsWith("SERVICE_KEY="),
    );
    key = setting?.slice("SERVICE_KEY=".length);
  }
  if (!key) throw new Error("Storage maintenance configuration required");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
