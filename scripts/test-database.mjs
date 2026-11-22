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
    "equipment_register.sql",
    "schedule_changes.sql",
    "import_preview.sql",
    "import_apply.sql",
    "maintenance_plans.sql",
    "recurring_visits.sql",
    "office_work_queues.sql",
    "visit_handover.sql",
    "private_evidence.sql",
    "report_issuance.sql",
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
      if (file === "visit_handover.sql") {
        await db.query(
          await readFile(
            new URL(
              "../supabase/tests/follow_up_returned_draft.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        console.log("PASS: follow_up_returned_draft.sql");
        await db.query(
          await readFile(
            new URL(
              "../supabase/tests/offline_visit_bundle.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        console.log("PASS: offline_visit_bundle.sql");
        await db.query(
          await readFile(
            new URL("../supabase/tests/field_replay.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: field_replay.sql");
        await db.query(
          await readFile(
            new URL("../supabase/tests/photo_replay.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: photo_replay.sql");
        await db.query(
          await readFile(
            new URL(
              "../supabase/tests/field_reconciliation.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        console.log("PASS: field_reconciliation.sql");
      }
      if (file === "report_issuance.sql") {
        await db.query(
          await readFile(
            new URL("../supabase/tests/pdf_worker.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: pdf_worker.sql");
        await db.query("savepoint follow_up_checks");
        await db.query(
          await readFile(
            new URL(
              "../supabase/tests/follow_up_operations.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        console.log("PASS: follow_up_operations.sql");
        await db.query("rollback to savepoint follow_up_checks");
        await db.query("release savepoint follow_up_checks");
        await db.query("savepoint amendment_checks");
        await db.query(
          await readFile(
            new URL("../supabase/tests/report_amendments.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: report_amendments.sql");
        await db.query("rollback to savepoint amendment_checks");
        await db.query("release savepoint amendment_checks");
        await db.query(
          await readFile(
            new URL("../supabase/tests/report_links.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: report_links.sql");
        await db.query(
          await readFile(
            new URL("../supabase/tests/report_receipts.sql", import.meta.url),
            "utf8",
          ),
        );
        console.log("PASS: report_receipts.sql");
      }
    } finally {
      await db.query("rollback");
    }
  }
}).catch(reportFailure);
