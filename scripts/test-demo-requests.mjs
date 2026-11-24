import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withDatabase, reportFailure } from "./database.mjs";

await withDatabase(async db => {
  await db.query("begin");
  const email = `demo-${randomUUID()}@hvac.example.invalid`;
  const call = (id = randomUUID(), plan = "tim", address = email) => db.query(
    "select public.submit_demo_request($1,'Fictional operator',$2,'Fictional service',$3) as id", [id, address, plan],
  );
  async function denied(run, code) {
    await db.query("savepoint expected_failure");
    try { await assert.rejects(run, error => error.code === code); }
    finally { await db.query("rollback to expected_failure"); }
  }
  try {
    await db.query("set local role anon");
    const id = randomUUID();
    assert.equal((await call(id)).rows[0].id, id);
    assert.equal((await call(id)).rows[0].id, id);
    await denied(() => call(id, "solo"), "PT409");
    await denied(() => call(randomUUID(), "enterprise"), "22023");
    await denied(() => call(randomUUID(), "", "bad-email"), "22023");
    await denied(() => db.query("select * from hvac_private.demo_requests"), "42501");
    await denied(() => db.query("insert into hvac_private.demo_requests values($1,'x',$2,'x','',now())", [randomUUID(),email]), "42501");
    await call(); await call();
    await denied(() => call(), "PT429");
    // A confirmed retry remains safe even after the quota is consumed.
    assert.equal((await call(id)).rows[0].id, id);
    await db.query("reset role");
    assert.equal((await db.query("select count(*)::int as n from hvac_private.demo_requests where email=$1", [email])).rows[0].n, 3);
    // Any application identity, including another organization/unassigned technician,
    // lacks lead-read authority. Neither tenant roles nor claims can unlock it.
    for (const actor of ["a1000000-0000-4000-8000-000000000101", "a1000000-0000-4000-8000-000000000103", "a1000000-0000-4000-8000-000000000104"]) {
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:actor,role:"authenticated"})]);
      await db.query("set local role authenticated");
      await denied(() => db.query("select * from hvac_private.demo_requests"), "42501");
      await db.query("reset role");
    }
    await db.query(`insert into hvac_private.demo_requests(operation_id,name,email,company,plan)
      select extensions.gen_random_uuid(),'Fictional operator','global-'||n||'@hvac.example.invalid','Fictional service','' from generate_series(1,100) n`);
    await db.query("set local role anon");
    await denied(() => call(randomUUID(), "", `fresh-${randomUUID()}@hvac.example.invalid`), "PT429");
    await db.query("reset role");
    // Simulate an actual storage error within a rolled-back test scope.
    await db.query("savepoint storage_failure");
    await db.query("delete from hvac_private.demo_requests where email like 'global-%@hvac.example.invalid'");
    await db.query("alter table hvac_private.demo_requests add constraint demo_test_storage_failure check(false) not valid");
    await db.query("set local role anon");
    await denied(() => call(randomUUID(), "", `storage-${randomUUID()}@hvac.example.invalid`), "23514");
    await db.query("reset role");
    await db.query("rollback to storage_failure");
    console.log("PASS: anonymous validation, exact retry, conflicting retry, per-email/global quotas, restricted reads/writes, tenant/unassigned claims and atomic storage failure (rolled back).");
  } finally { await db.query("rollback"); }
}).catch(reportFailure);
