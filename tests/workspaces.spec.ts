import { openWorkspaceControls } from "./staff-controls";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createVerificationFixture } from "./auth-fixtures";

test.skip(
  !process.env.SEED_PASSWORD || !process.env.DATABASE_URL,
  "Development database and auth settings required.",
);
async function confirm(
  page: Page,
  fixture: Awaited<ReturnType<typeof createVerificationFixture>>,
) {
  await page.goto(`/auth/confirm?token_hash=${fixture.tokenHash}&type=signup`);
  await expect(page).toHaveURL(/\/account$/);
}
async function createWorkspaceUI(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Naziv firme").fill(name);
  await page
    .getByRole("button", { name: "Napravi radni prostor", exact: true })
    .click();
  await expect(page).toHaveURL(/\/office$/);
}
async function inviteUI(page: Page, email: string) {
  await page.goto("/settings/team");
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pozovi novu osobu" }) });
  await form.getByLabel("Email nove osobe").fill(email);
  await form
    .getByRole("button", { name: "Napravi poziv", exact: true })
    .click();
  const input = form.getByLabel("Link poziva");
  await expect(input).toBeVisible();
  return input.inputValue();
}

test("workspace creation, invite, role changes, revoked access and switching", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90000);
  const owner = await createVerificationFixture();
  const technician = await createVerificationFixture();
  const techContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
  });
  const techPage = await techContext.newPage();
  page.setDefaultTimeout(10000);
  techPage.setDefaultTimeout(10000);
  const name = `Probni tim ${testInfo.project.name} ${randomUUID().slice(0, 6)}`;
  try {
    await confirm(page, owner);
    await createWorkspaceUI(page, name);
    // Reopening and repeating the original onboarding request reuses the same organization.
    await createWorkspaceUI(page, name);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
      1,
    );
    const link = await inviteUI(page, technician.email);
    await page.goto(link);
    await page.getByRole("button", { name: "Prihvati poziv" }).click();
    await expect(
      page.getByText("Email naloga ne odgovara pozivu.", { exact: false }),
    ).toBeVisible();
    await confirm(techPage, technician);
    // Signed-out acceptance returns to the invitation after signing in.
    await techPage.getByRole("button", { name: "Odjavi se" }).click();
    await expect(techPage).toHaveURL(/\/sign-in$/);
    await techPage.goto(link);
    await techPage
      .getByRole("link", { name: "Prijavi se za prihvatanje" })
      .click();
    await techPage.getByLabel("Email adresa").fill(technician.email);
    await techPage
      .getByLabel("Lozinka", { exact: true })
      .fill(technician.password);
    await techPage
      .getByRole("button", { name: "Prijavi se", exact: true })
      .click();
    await expect(
      techPage.getByRole("button", { name: "Prihvati poziv" }),
    ).toBeVisible();
    await techPage.getByRole("button", { name: "Prihvati poziv" }).click();
    await expect(techPage).toHaveURL(/\/today$/);
    await techPage.goto(link);
    await techPage.getByRole("button", { name: "Prihvati poziv" }).click();
    await expect(techPage).toHaveURL(/\/today$/);
    await techPage.goto("/settings/team");
    await expect(
      techPage.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
    await techPage.goto("/office");
    await expect(
      techPage.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
    await page.goto("/settings/team");
    const ownMember = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: owner.email, exact: true }),
    });
    await ownMember
      .getByLabel("Uloga", { exact: true })
      .selectOption("technician");
    await ownMember.getByRole("button", { name: "Sačuvaj članstvo" }).click();
    await expect(
      ownMember.getByText(
        "Radni prostor mora imati najmanje jednog aktivnog vlasnika.",
      ),
    ).toBeVisible();
    const member = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: technician.email, exact: true }),
      })
      .first();
    await member
      .getByLabel("Uloga", { exact: true })
      .selectOption("coordinator");
    await member.getByRole("button", { name: "Sačuvaj članstvo" }).click();
    await expect(member.getByText("Članstvo je sačuvano.")).toBeVisible();
    await techPage.goto("/office");
    await expect(
      techPage.getByRole("heading", { name: "Kancelarija", exact: true }),
    ).toBeVisible();
    await techPage.goto("/settings/team");
    await expect(
      techPage.getByRole("heading", { name: "Stranica nije dostupna" }),
    ).toBeVisible();
    await member.getByLabel("Stanje članstva").selectOption("false");
    await member.getByRole("button", { name: "Sačuvaj članstvo" }).click();
    await expect(member.getByText("Koordinator · Opozvano")).toBeVisible();
    await techPage.goto("/today");
    await expect(techPage).toHaveURL(/\/onboarding$/);
    await techPage.goto(link);
    await techPage.getByRole("button", { name: "Prihvati poziv" }).click();
    await expect(
      techPage.getByText(
        "Poziv je istekao, opozvan ili više nije dostupan. Zatražite novi poziv.",
      ),
    ).toBeVisible();
    await page.goto("/settings/workspace");
    await page.getByLabel("Naziv firme").fill(`${name} izmenjen`);
    await page.getByRole("button", { name: "Sačuvaj podatke" }).click();
    await expect(page.getByText("Podaci firme su sačuvani.")).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "Novi radni prostor" }).click();
    await page.getByLabel("Naziv firme").fill(`${name} drugi`);
    await page
      .getByRole("button", { name: "Napravi radni prostor", exact: true })
      .click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto("/settings/team");
    await expect(
      page.getByRole("heading", { name: technician.email, exact: true }),
    ).toHaveCount(0);
    await openWorkspaceControls(page);
    await page
      .getByRole("combobox", { name: "Radni prostor", exact: true })
      .selectOption({ label: `${name} izmenjen · Vlasnik` });
    await page.getByRole("button", { name: "Otvori radni prostor" }).click();
    await expect(
      page.getByRole("main").getByText(`${name} izmenjen`, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("office.png"),
      fullPage: true,
    });
    await page.goto("/settings/team");
    await expect(
      page.getByRole("heading", { name: "Tim i pozivi", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("team.png"),
      fullPage: true,
    });
  } finally {
    await techContext.close();
    await owner.dispose();
    await technician.dispose();
  }
});

const client = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
test("direct API retries, cross-tenant denial and simultaneous owner demotion", async () => {
  const first = await createVerificationFixture();
  const second = await createVerificationFixture();
  const a = client(),
    b = client();
  try {
    expect(
      (await a.auth.verifyOtp({ token_hash: first.tokenHash, type: "signup" }))
        .error,
    ).toBeNull();
    expect(
      (await b.auth.verifyOtp({ token_hash: second.tokenHash, type: "signup" }))
        .error,
    ).toBeNull();
    const operation = randomUUID();
    const args = {
      p_operation_id: operation,
      p_name: "API concurrency test",
      p_time_zone: "Europe/Belgrade",
    };
    const created = await Promise.all([
      a.rpc("create_workspace", args),
      a.rpc("create_workspace", args),
    ]);
    expect(created.every((result) => !result.error)).toBe(true);
    const target = created[0].data;
    expect(created[1].data).toBe(target);
    const settings = {
      p_organization_id: target,
      p_name: "API concurrency test",
      p_time_zone: "Europe/Belgrade",
      p_version: 1,
    };
    expect((await a.rpc("update_workspace", settings)).error).toBeNull();
    expect((await a.rpc("update_workspace", settings)).error?.code).toBe(
      "PT409",
    );
    const denied = await b.rpc("workspace_roster", {
      p_organization_id: target,
    });
    expect(denied.error?.code).toBe("42501");
    const token = digest(randomBytes(32).toString("base64url"));
    expect(
      (
        await a.rpc("create_workspace_invitation", {
          p_organization_id: target,
          p_operation_id: randomUUID(),
          p_email: second.email,
          p_role: "owner",
          p_token_hash: token,
        })
      ).error,
    ).toBeNull();
    const accepts = await Promise.all([
      b.rpc("accept_workspace_invitation", { p_token_hash: token }),
      b.rpc("accept_workspace_invitation", { p_token_hash: token }),
    ]);
    expect(
      accepts.every((result) => !result.error && result.data === target),
    ).toBe(true);
    const roster = await a.rpc("workspace_roster", {
      p_organization_id: target,
    });
    expect(roster.data).toHaveLength(2);
    const m1 = roster.data.find(
      (row: { user_id: string }) => row.user_id === first.id,
    );
    const m2 = roster.data.find(
      (row: { user_id: string }) => row.user_id === second.id,
    );
    const demote = (
      c: ReturnType<typeof client>,
      m: { membership_id: string; version: number },
    ) =>
      c.rpc("update_workspace_member", {
        p_organization_id: target,
        p_membership_id: m.membership_id,
        p_role: "technician",
        p_active: true,
        p_version: m.version,
      });
    const results = await Promise.all([demote(a, m1), demote(b, m2)]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(
      results.filter((result) => result.error?.message === "last_active_owner"),
    ).toHaveLength(1);
    const memberships = await a
      .from("memberships")
      .select("role")
      .eq("organization_id", target);
    // Own-row policies continue to restrict direct table reads even after authority changes.
    expect(memberships.data?.length).toBe(1);
    expect((await client().rpc("create_workspace", args)).error).toBeTruthy();
  } finally {
    await a.auth.signOut({ scope: "local" });
    await b.auth.signOut({ scope: "local" });
    await first.dispose();
    await second.dispose();
  }
});
