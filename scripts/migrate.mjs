import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { withDatabase, reportFailure } from "./database.mjs";

await withDatabase(async (db) => {
  await db.query("begin");
  try {
    await db.query(
      "select pg_advisory_xact_lock(hashtext('hvac_schema_migrations'))",
    );
    await db.query(`create schema if not exists hvac_migrations;
      revoke all on schema hvac_migrations from public, anon, authenticated;
      create table if not exists hvac_migrations.applied (name text primary key, checksum text not null, applied_at timestamptz not null default now());
      revoke all on hvac_migrations.applied from public, anon, authenticated;`);
    const files = (
      await readdir(new URL("../supabase/migrations/", import.meta.url))
    )
      .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const sql = await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows } = await db.query(
        "select checksum from hvac_migrations.applied where name = $1",
        [name],
      );
      if (rows.length) {
        if (rows[0].checksum !== checksum)
          throw new Error("Applied migration checksum changed.");
        console.log(`Already applied: ${name}`);
        continue;
      }
      await db.query(sql);
      await db.query(
        "insert into hvac_migrations.applied (name, checksum) values ($1, $2)",
        [name, checksum],
      );
      console.log(`Applied: ${name}`);
    }
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}).catch(reportFailure);
