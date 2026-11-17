import pg from "pg";
import { storageMaintenanceClient } from "../scripts/storage-maintenance.mjs";
import { randomUUID } from "node:crypto";

export async function createReportFixture({
  submitted = true,
  systemCount = 4,
} = {}) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const org = "a1000000-0000-4000-8000-000000000001";
  const owner = "a1000000-0000-4000-8000-000000000101";
  const tech = "a1000000-0000-4000-8000-000000000102";
  const customerId = randomUUID(),
    siteId = randomUUID(),
    visitId = randomUUID();
  const systemIds = Array.from({ length: systemCount }, () => randomUUID());
  const entityIds = [customerId, siteId, visitId, ...systemIds];
  const siteName = "Jagodina " + siteId.slice(0, 8);
  async function rpc(actor: string, name: string, values: unknown[]) {
    if (!["save_operation", "visit_bundle", "visit_command"].includes(name))
      throw new Error("Unsupported fixture command");
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor,
      ]);
      const result = await db.query(
        `select public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
        values,
      );
      await db.query("commit");
      return result.rows[0].result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  async function dispose() {
    try {
      const paths = (
        await db.query(
          "select organization_id||'/'||id||'.pdf' as path from public.report_revisions where organization_id=$1 and visit_id=$2",
          [org, visitId],
        )
      ).rows.map((row) => row.path);
      if (paths.length) {
        const storage = await storageMaintenanceClient();
        const { error } = await storage.storage
          .from("report-pdfs")
          .remove(paths);
        if (error) throw new Error("Fixture storage cleanup failed");
      }
      await db.query("begin");
      await db.query(
        "delete from hvac_private.identity_events where subject_id in(select l.id from hvac_private.report_links l join public.report_revisions r on r.id=l.revision_id where r.organization_id=$1 and r.visit_id=$2)",
        [org, visitId],
      );
      for (const table of [
        "report_receipts",
        "report_links",
        "report_artifacts",
        "report_retry_receipts",
      ])
        await db.query(
          `delete from hvac_private.${table} where revision_id in(select id from public.report_revisions where organization_id=$1 and visit_id=$2)`,
          [org, visitId],
        );
      await db.query(
        "delete from hvac_private.report_issue_receipts where organization_id=$1 and visit_id=$2",
        [org, visitId],
      );
      await db.query(
        "delete from hvac_private.render_jobs where revision_id in(select id from public.report_revisions where organization_id=$1 and visit_id=$2)",
        [org, visitId],
      );
      await db.query(
        "delete from hvac_private.identity_events where organization_id=$1 and (subject_id=$2 or subject_id in(select id from public.report_revisions where organization_id=$1 and visit_id=$2))",
        [org, visitId],
      );
      await db.query(
        "delete from public.report_revisions where organization_id=$1 and visit_id=$2",
        [org, visitId],
      );
      await db.query(
        "delete from public.follow_ups where item_id in(select id from public.visit_items where visit_id=$1)",
        [visitId],
      );
      for (const table of ["attachments", "visit_items", "visit_assignees"])
        await db.query(`delete from public.${table} where visit_id=$1`, [
          visitId,
        ]);
      await db.query(
        "delete from hvac_private.visit_corrections where visit_id=$1",
        [visitId],
      );
      await db.query(
        "delete from hvac_private.operation_receipts where organization_id=$1 and (operation_id=any($2::uuid[]) or payload->>'visit'=$3)",
        [org, entityIds, visitId],
      );
      for (const table of ["visits", "systems", "sites", "customers"])
        await db.query(`delete from public.${table} where id=any($1::uuid[])`, [
          entityIds,
        ]);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      await db.end();
    }
  }
  try {
    const member = (
      await db.query(
        "select id from public.memberships where organization_id=$1 and user_id=$2 and active",
        [org, tech],
      )
    ).rows[0].id;
    const create = (id: string, kind: string, data: unknown) =>
      rpc(owner, "save_operation", [org, id, kind, JSON.stringify(data)]);
    await create(customerId, "customer", {
      name: "Fiktivni klijent",
      contact: "Fiktivni kontakt",
    });
    await create(siteId, "site", {
      customerId,
      code: siteId.slice(0, 8),
      name: siteName,
      address: "Primer 14, Jagodina",
      accessNote: "SECRET-ACCESS",
      timeZone: "Europe/Belgrade",
    });
    for (const [index, id] of systemIds.entries())
      await create(id, "system", {
        siteId,
        code: `KL-${String(index + 1).padStart(2, "0")}`,
        room:
          index === 3
            ? "Arhiva"
            : `Prostorija ${index + 1} · Čačak, ćošak, šuma, žbun, đak`,
        model: "Fiktivni model · ČĆŠŽĐ čćšžđ",
        serial: `FIK-${index + 1}`,
      });
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Belgrade",
    });
    await create(visitId, "visit", {
      siteId,
      visitType: "maintenance",
      start: day + "T09:00",
      end: day + "T12:00",
      systems: systemIds,
      members: [member],
    });
    const bundle = await rpc(tech, "visit_bundle", [org, visitId]);
    for (const [index, item] of bundle.items.entries()) {
      await rpc(tech, "visit_command", [
        org,
        visitId,
        randomUUID(),
        "save",
        1,
        JSON.stringify({
          itemId: item.id,
          outcome:
            ["serviced", "serviced", "repair_needed", "no_access"][index] ||
            "serviced",
          work: index !== 3 ? "Čišćenje i pregled" : "",
          finding: index === 2 ? "Oštećen deflektor" : "",
          noAccessReason: index === 3 ? "Zaključana arhiva" : "",
          internalNote: "SECRET-INTERNAL",
          readings:
            index === 1
              ? [
                  {
                    kind: "Struja",
                    status: "measured",
                    value: 0,
                    unit: "A",
                    mode: "Hlađenje",
                    private: "SECRET-READING",
                  },
                  {
                    kind: "Temperatura izduva",
                    status: "not_measured",
                    value: null,
                    unit: "°C",
                    mode: "Hlađenje",
                  },
                ]
              : [],
          parts: [],
          followUp:
            index === 2 || index === 3
              ? {
                  kind: index === 2 ? "quote" : "revisit",
                  ownerId: member,
                  dueDate: "2026-12-10",
                  customerAction: index === 3 ? "Obezbediti pristup" : "",
                }
              : null,
        }),
      ]);
    }
    let current = await rpc(tech, "visit_bundle", [org, visitId]);
    if (submitted) {
      await rpc(tech, "visit_command", [
        org,
        visitId,
        randomUUID(),
        "submit",
        current.version,
        "{}",
      ]);
      current = await rpc(tech, "visit_bundle", [org, visitId]);
    }
    return {
      org,
      visitId,
      siteId,
      customerId,
      systemIds,
      siteName,
      version: current.version as number,
      itemIds: bundle.items.map((item: { id: string }) => item.id) as string[],
      db,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
