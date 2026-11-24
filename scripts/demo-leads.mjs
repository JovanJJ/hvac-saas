import { withDatabase, reportFailure } from "./database.mjs";

// Explicit operator tool. Outputs contact details: run only in a private terminal.
const args = process.argv.slice(2);
const id = args[0];
if (args.length !== 1 || !(id === "--recent" || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
  console.error("Usage: npm run demo:leads -- --recent | RECEIPT_UUID (private terminal only)");
  process.exitCode = 1;
} else {
  await withDatabase(async db => {
    await db.query("begin read only");
    try {
      const { rows } = await db.query(
        `select operation_id,created_at,name,email,company,nullif(plan,'') as plan from hvac_private.demo_requests ${id === "--recent" ? "order by created_at desc limit 50" : "where operation_id=$1"}`,
        id === "--recent" ? [] : [id],
      );
      console.log(JSON.stringify(rows, null, 2));
    } finally { await db.query("rollback"); }
  }).catch(reportFailure);
}
