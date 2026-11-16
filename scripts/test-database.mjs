import { readFile } from "node:fs/promises";
import { withDatabase, reportFailure } from "./database.mjs";

await withDatabase(async (db) => {
  const { rows } = await db.query(
    "select count(*)::int as count from auth.users where id in ('a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104') and email like '%@hvac.example.invalid'",
  );
  if (rows[0].count !== 4)
    throw new Error(
      "Development fixtures must be seeded before database tests.",
    );
  for (const file of [
    "identity_access.sql",
    "workspace_commands.sql",
    "register_schedule.sql",
  ]) {
    await db.query("begin");
    try {
      await db.query(
        await readFile(
          new URL("../supabase/tests/" + file, import.meta.url),
          "utf8",
        ),
      );
      console.log("PASS: " + file);
    } finally {
      await db.query("rollback");
    }
  }
}).catch(reportFailure);
