import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createReportFixture } from "./report-fixture";

test("office issues one immutable four-system revision with a queued PDF at both widths", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10000);
  const fixture = await createReportFixture();
  const techContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  const tech = await techContext.newPage();
  async function login(p: typeof page, email: string) {
    await p.goto("/sign-in");
    await p.getByLabel("Email adresa").fill(email);
    await p
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await p.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(p).toHaveURL(/\/(office|today)$/);
  }
  try {
    await login(tech, "technician.a@hvac.example.invalid");
    await tech.goto(`/visits/${fixture.visitId}`);
    await expect(
      tech.getByRole("button", { name: "Izdaj izveštaj", exact: true }),
    ).toHaveCount(0);
    await login(page, "owner.a@hvac.example.invalid");
    await page
      .getByRole("link", {
        name: `${fixture.siteName} · Otvori pregled`,
        exact: true,
      })
      .click();
    await page
      .getByRole("link", { name: "Pregled za klijenta", exact: true })
      .click();
    const draft = page.getByRole("article", {
      name: "Nacrt servisnog izveštaja",
    });
    await expect(draft.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(draft).not.toContainText("SECRET");
    await page
      .getByRole("link", { name: "Nazad na pregled", exact: true })
      .click();
    const pendingId = randomUUID();
    await fixture.db.query(
      "insert into public.attachments(id,organization_id,visit_id,item_id,author_id,caption,visibility,expected_bytes,mime_type) values($1,$2,$3,$4,'a1000000-0000-4000-8000-000000000102','Pending test','customer',68,'image/png')",
      [pendingId, fixture.org, fixture.visitId, fixture.itemIds[0]],
    );
    await page
      .getByRole("button", { name: "Izdaj izveštaj", exact: true })
      .click();
    await expect(
      page.getByRole("form", { name: "Izdavanje izveštaja" }).getByRole("alert").filter({ hasText: "fotografije koje čekaju" }),
    ).toBeVisible();
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from public.report_revisions where visit_id=$1",
          [fixture.visitId],
        )
      ).rows[0].n,
    ).toBe(0);
    await fixture.db.query("delete from public.attachments where id=$1", [
      pendingId,
    ]);
    await page
      .getByRole("button", { name: "Izdaj izveštaj", exact: true })
      .click();
    await expect(page).toHaveURL(/\/office\/reports\/[0-9a-f-]+$/);
    const report = page.getByRole("article", {
      name: "Izdat servisni izveštaj",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Čeka izradu PDF-a" }),
    ).toBeVisible();
    await expect(report.getByRole("definition")).toHaveText(["4", "3", "2"]);
    await expect(
      report.getByText("Struja: 0 A · Hlađenje", { exact: true }),
    ).toBeVisible();
    await expect(report).not.toContainText("SECRET");
    await expect(
      page.getByRole("button", { name: /Podeli|Preuzmi|Izdaj/ }),
    ).toHaveCount(0);
    const before = await report.innerText();
    await fixture.db.query(
      "update public.customers set name='Changed customer' where id=$1",
      [fixture.customerId],
    );
    await fixture.db.query(
      "update public.sites set name='Changed site',address='Changed address' where id=$1",
      [fixture.siteId],
    );
    await fixture.db.query(
      "update public.systems set model='Changed model' where id=any($1::uuid[])",
      [fixture.systemIds],
    );
    await page.reload();
    await expect(report).toHaveText(before, { useInnerText: true });
    await page.screenshot({
      path: info.outputPath("issued-revision.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const revisionUrl = page.url();
    await tech.goto(`/visits/${fixture.visitId}`);
    await expect(
      tech.getByText("Stanje: Izdat izveštaj", { exact: true }),
    ).toBeVisible();
    await expect(
      tech.getByRole("button", {
        name: /Sačuvaj KL|Dodaj fotografiju|Predaj kancelariji/,
      }),
    ).toHaveCount(0);
    await tech.goto(revisionUrl);
    await expect(
      tech.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
    await techContext.clearCookies();
    await login(tech, "owner.b@hvac.example.invalid");
    await tech.goto(revisionUrl);
    await expect(
      tech.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
    await page.goto("/office");
    const revisions = await fixture.db.query(
      "select report_number from public.report_revisions where visit_id=$1",
      [fixture.visitId],
    );
    await page
      .getByRole("link", {
        name: `${revisions.rows[0].report_number} · ${fixture.siteName} · Revizija 1`,
        exact: true,
      })
      .click();
    await expect(report).toHaveText(before, { useInnerText: true });
  } finally {
    await techContext.close();
    await fixture.dispose();
  }
});

test("direct API concurrent issues converge and raw revision writes stay denied", async () => {
  const fixture = await createReportFixture();
  const clients: ReturnType<typeof createApiClient>[] = [];
  function createApiClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  function client() {
    const value = createApiClient();
    clients.push(value);
    return value;
  }
  async function login(email: string) {
    const value = client();
    expect(
      (
        await value.auth.signInWithPassword({
          email,
          password: process.env.SEED_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    return value;
  }
  try {
    const owner = await login("owner.a@hvac.example.invalid");
    const args = {
      p_organization_id: fixture.org,
      p_visit_id: fixture.visitId,
      p_version: fixture.version,
    };
    const op = randomUUID();
    const commands = [op, randomUUID()].map((id) => ({
      ...args,
      p_operation_id: id,
    }));
    const issued = await Promise.all(
      commands.map((command) => owner.rpc("issue_report", command)),
    );
    expect(issued.every((result) => !result.error)).toBe(true);
    expect(issued[0].data).toBe(issued[1].data);
    const revisionId = issued[0].data;
    expect((await owner.rpc("issue_report", commands[0])).data).toBe(
      revisionId,
    );
    expect(
      (
        await owner.rpc("issue_report", {
          ...commands[0],
          p_version: args.p_version + 1,
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      (
        await fixture.db.query(
          "select count(*)::int n from hvac_private.render_jobs where revision_id=$1",
          [revisionId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await owner
          .from("report_revisions")
          .update({ snapshot: {} })
          .eq("id", revisionId)
      ).error?.code,
    ).toBe("42501");
    const revision = await owner.rpc("report_revision", {
      p_organization_id: fixture.org,
      p_revision_id: revisionId,
    });
    expect(revision.error).toBeNull();
    expect(revision.data.renderState).toBe("queued");
    expect(revision.data.data.totals).toEqual({
      planned: 4,
      inspected: 3,
      actions: 2,
    });
    expect(JSON.stringify(revision.data.data)).not.toContain("SECRET");
    for (const identity of [
      client(),
      await login("technician.a@hvac.example.invalid"),
      await login("owner.b@hvac.example.invalid"),
      await login("unassigned@hvac.example.invalid"),
    ]) {
      expect(
        (
          await identity.rpc("issue_report", {
            ...args,
            p_operation_id: randomUUID(),
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await identity.rpc("report_revision", {
            p_organization_id: fixture.org,
            p_revision_id: revisionId,
          })
        ).error?.code,
      ).toBe("42501");
    }
  } finally {
    await Promise.allSettled(
      clients.map((value) => value.auth.signOut({ scope: "local" })),
    );
    await fixture.dispose();
  }
});
