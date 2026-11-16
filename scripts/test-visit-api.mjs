import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { withDatabase } from "./database.mjs";

const org = "a1000000-0000-4000-8000-000000000001";
const ids = Array.from({ length: 5 }, () => randomUUID());
const [customer, site, systemA, systemB, visit] = ids;
const clients = [];
let stage = "authentication";
function create() {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  clients.push(client);
  return client;
}
async function login(email) {
  const client = create();
  assert.equal(
    (
      await client.auth.signInWithPassword({
        email,
        password: process.env.SEED_PASSWORD,
      })
    ).error,
    null,
  );
  return client;
}
try {
  const owner = await login("owner.a@hvac.example.invalid");
  const tech = await login("technician.a@hvac.example.invalid");
  const roster = await owner.rpc("workspace_roster", {
    p_organization_id: org,
  });
  const member = roster.data.find(
    (m) => m.email === "technician.a@hvac.example.invalid",
  );
  async function save(id, kind, data) {
    stage = "create " + kind;
    const result = await owner.rpc("save_operation", {
      p_organization_id: org,
      p_operation_id: id,
      p_kind: kind,
      p_data: data,
    });
    assert.equal(result.error, null);
  }
  await save(customer, "customer", { name: "Fictional API check" });
  await save(site, "site", {
    customerId: customer,
    name: "API test",
    code: site,
    address: "Fictional 14",
    timeZone: "Europe/Belgrade",
  });
  for (const [index, system] of [systemA, systemB].entries())
    await save(system, "system", {
      siteId: site,
      code: "API-" + index,
      room: "Fictional",
    });
  await save(visit, "visit", {
    siteId: site,
    visitType: "maintenance",
    start: "2026-11-16T09:00",
    end: "2026-11-16T10:00",
    systems: [systemA, systemB],
    members: [member.membership_id],
  });
  const args = { p_organization_id: org, p_visit_id: visit };
  stage = "assigned bundle";
  const bundle = await tech.rpc("visit_bundle", args);
  assert.equal(bundle.error, null);
  stage = "direct attachment verification denial";
  const photoArgs = { ...args, p_attachment_id: randomUUID() };
  assert.equal(
    (
      await tech.rpc("attachment_command", {
        ...photoArgs,
        p_kind: "reserve",
        p_data: {
          itemId: bundle.data.items[0].id,
          caption: "Fictional API photo",
          visibility: "internal",
          bytes: 68,
          mimeType: "image/png",
        },
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await tech.rpc("attachment_command", {
        ...photoArgs,
        p_kind: "complete",
        p_data: {},
      })
    ).error?.code,
    "42501",
  );
  assert.equal(
    (
      await tech
        .from("attachments")
        .update({ state: "verified" })
        .eq("id", photoArgs.p_attachment_id)
    ).error?.code,
    "42501",
  );
  assert.equal(
    (
      await tech.rpc("attachment_command", {
        ...photoArgs,
        p_kind: "remove",
        p_data: {},
      })
    ).error,
    null,
  );
  for (const client of [
    create(),
    await login("owner.b@hvac.example.invalid"),
    await login("unassigned@hvac.example.invalid"),
  ]) {
    stage = "denied bundle and command";
    assert.equal((await client.rpc("visit_bundle", args)).error?.code, "42501");
    assert.equal(
      (
        await client.rpc("visit_command", {
          ...args,
          p_operation_id: randomUUID(),
          p_kind: "submit",
          p_version: 1,
          p_data: {},
        })
      ).error?.code,
      "42501",
    );
  }
  stage = "concurrent item saves";
  const saves = await Promise.all(
    bundle.data.items.map((item) =>
      tech.rpc("visit_command", {
        ...args,
        p_operation_id: randomUUID(),
        p_kind: "save",
        p_version: 1,
        p_data: {
          itemId: item.id,
          outcome: "serviced",
          work: "Čišćenje",
          readings: [
            {
              kind: "Struja",
              mode: "Hlađenje",
              status: "measured",
              value: 0,
              unit: "A",
            },
          ],
          parts: [],
          followUp: null,
        },
      }),
    ),
  );
  assert.ok(
    saves.every((result) => !result.error),
    "Independent item saves should both succeed.",
  );
  const latest = await tech.rpc("visit_bundle", args);
  const commands = [randomUUID(), randomUUID()].map((id) => ({
    ...args,
    p_operation_id: id,
    p_kind: "submit",
    p_version: latest.data.version,
    p_data: {},
  }));
  stage = "concurrent submissions";
  const submissions = await Promise.all(
    commands.map((command) => tech.rpc("visit_command", command)),
  );
  assert.equal(submissions.filter((r) => !r.error).length, 1);
  assert.equal(submissions.find((r) => r.error)?.error.code, "PT409");
  const winner = submissions.findIndex((r) => !r.error);
  stage = "submission replay";
  assert.equal((await tech.rpc("visit_command", commands[winner])).error, null);
  stage = "raw table denial";
  assert.equal(
    (
      await tech
        .from("visit_items")
        .update({ outcome: "pending" })
        .eq("visit_id", visit)
    ).error?.code,
    "42501",
  );
  assert.deepEqual((await tech.from("follow_ups").select("id")).data, []);
  console.log(
    "PASS: direct visit API isolation, concurrent independent item saves, concurrent submissions, replay and denied raw writes.",
  );
} catch {
  console.error(
    `Visit API checks failed at ${stage}. No credentials or session values were logged.`,
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(
    clients.map((client) => client.auth.signOut({ scope: "local" })),
  );
  await withDatabase(async (db) => {
    await db.query("begin");
    try {
      await db.query("delete from public.attachments where visit_id=$1", [
        visit,
      ]);
      await db.query(
        "delete from public.follow_ups where item_id in(select id from public.visit_items where visit_id=$1)",
        [visit],
      );
      await db.query("delete from public.visit_items where visit_id=$1", [
        visit,
      ]);
      await db.query("delete from public.visit_assignees where visit_id=$1", [
        visit,
      ]);
      await db.query(
        "delete from hvac_private.operation_receipts where operation_id=any($1::uuid[]) or payload->>'visit'=$2",
        [ids, visit],
      );
      for (const table of ["visits", "systems", "sites", "customers"])
        await db.query(`delete from public.${table} where id=any($1::uuid[])`, [
          ids,
        ]);
      await db.query("commit");
    } catch {
      await db.query("rollback");
      process.exitCode = 1;
      console.error("Visit API fixture cleanup failed.");
    }
  }).catch(() => {
    process.exitCode = 1;
    console.error("Visit API fixture cleanup failed.");
  });
}
