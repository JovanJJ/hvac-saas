import { expect, test, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { createVerificationFixture } from "./auth-fixtures";
import { createReportFixture } from "./report-fixture";

async function confirm(page: Page, fixture: Awaited<ReturnType<typeof createVerificationFixture>>) {
  await page.goto(`/auth/confirm?token_hash=${fixture.tokenHash}&type=signup`);
  await expect(page).toHaveURL(/\/account$/);
}
async function createWorkspace(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Naziv firme").fill(name);
  await page.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
  await expect(page).toHaveURL(/\/office$/);
}
async function invite(page: Page, email: string, role = "technician") {
  await page.goto("/settings/team");
  const form = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pozovi novu osobu" }) });
  await form.getByLabel("Email nove osobe").fill(email);
  await form.getByLabel("Uloga", { exact: true }).selectOption(role);
  await form.getByRole("button", { name: "Napravi poziv", exact: true }).click();
  const link = form.getByLabel("Link poziva");
  await expect(link).toHaveValue(/\/invite\//);
  return link.inputValue();
}
async function choose(page: Page, name: string) {
  await page.goto("/account");
  await page.getByRole("button", { name: `Otvori ${name}`, exact: true }).click();
  await expect(page).toHaveURL(/\/(office|today)$/);
}

test("entry screens explain invited registration and preserve return links", async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 360, height: 900 });
  const next = `/invite/${"a".repeat(43)}`;
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await expect(page.getByRole("heading", { name: "Prijava", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Napravi nalog", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sign-up\\?next=${encodeURIComponent(next)}$`));
  await expect(page.getByText(/koristite imejl adresu navedenu u pozivu/)).toBeVisible();
  await expect(page.getByText(/ne pokreće probni period niti plaćenu pretplatu/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Privatnost", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("signup.png"), fullPage: true });
  await page.getByRole("link", { name: "Prijava", exact: true }).click();
  await page.getByRole("link", { name: "Zaboravili ste lozinku?", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/forgot-password\\?next=${encodeURIComponent(next)}$`));
  await expect(page.getByRole("heading", { name: "Oporavak lozinke", exact: true })).toBeVisible();
  await expect(page.getByRole("main").locator('input[name="next"]')).toHaveValue(next);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("multiple workspaces require choice; deep links and revoked preferences stay scoped", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  const owner = await createVerificationFixture();
  const member = await createVerificationFixture();
  const unassigned = await createVerificationFixture();
  const techContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const unassignedContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const tech = await techContext.newPage();
  const names = [`UX06 Prvi ${randomUUID().slice(0, 6)}`, `UX06 Drugi ${randomUUID().slice(0, 6)}`];
  let fixture: Awaited<ReturnType<typeof createReportFixture>> | undefined;
  try {
    await confirm(page, owner);
    await createWorkspace(page, names[0]);
    const firstLink = await invite(page, member.email, "coordinator");
    await confirm(tech, member);
    await tech.goto(firstLink);
    await tech.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(tech).toHaveURL(/\/office$/);
    await page.goto("/account");
    await page.getByRole("button", { name: "Novi radni prostor", exact: true }).click();
    await page.getByLabel("Naziv firme").fill(names[1]);
    await page.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    const secondLink = await invite(page, member.email);
    await tech.goto(secondLink);
    await tech.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(tech).toHaveURL(/\/today$/);
    const cookieName = `teren_workspace_${member.id}`;
    const organization = (await page.context().cookies()).find(cookie => cookie.name === `teren_workspace_${owner.id}`)!.value;
    fixture = await createReportFixture({ submitted: false, organizationId: organization, ownerId: owner.id, technicianId: member.id });
    const unassignedLink = await invite(page, unassigned.email);
    const otherTech = await unassignedContext.newPage();
    await confirm(otherTech, unassigned);
    await otherTech.goto(unassignedLink);
    await otherTech.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(otherTech).toHaveURL(/\/today$/);
    expect((await unassignedContext.request.get(`/api/field/visits/${fixture.visitId}`)).status()).toBe(404);
    await otherTech.goto(`/visits/${fixture.visitId}`);
    await expect(otherTech.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    await techContext.clearCookies({ name: cookieName });
    await tech.goto("/");
    await expect(tech.getByRole("navigation", { name: "Navigacija u podnožju" }).getByRole("link", { name: "Izaberi firmu", exact: true })).toBeVisible();
    const deepLink = `/visits/${fixture.visitId}`;
    const denied = await techContext.request.get(`/api/field/visits/${fixture.visitId}`);
    expect(denied.status()).toBe(401);
    await tech.goto(deepLink);
    await expect(tech).toHaveURL(new RegExp(`/account\\?next=${encodeURIComponent(deepLink)}$`));
    await expect(tech.getByRole("heading", { name: "Izaberi firmu", exact: true })).toBeVisible();
    await expect(tech.getByText("Koordinator · Europe/Belgrade", { exact: true })).toBeVisible();
    await expect(tech.getByText("Tehničar · Europe/Belgrade", { exact: true })).toBeVisible();
    await tech.screenshot({ path: testInfo.outputPath("chooser.png"), fullPage: true });
    await tech.getByRole("button", { name: `Otvori ${names[1]}`, exact: true }).click();
    await expect(tech).toHaveURL(new RegExp(`${deepLink}$`));
    await expect(tech.getByRole("heading", { name: /Servisna poseta/ })).toBeVisible();
    await choose(tech, names[0]);
    await expect(tech).toHaveURL(/\/office$/);
    await tech.goto("/settings/team");
    await expect(tech.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    await tech.goto(deepLink);
    await expect(tech.getByRole("heading", { name: "Stranica nije dostupna" })).toBeVisible();
    await choose(page, names[0]);
    await page.goto("/settings/team");
    const membership = page.getByRole("article").filter({ has: page.getByRole("heading", { name: member.email, exact: true }) }).filter({ has: page.getByRole("combobox", { name: "Stanje članstva" }) });
    await membership.getByLabel("Stanje članstva").selectOption("false");
    await membership.getByRole("button", { name: "Sačuvaj članstvo", exact: true }).click();
    await expect(membership.getByText("Članstvo je sačuvano.")).toBeVisible();
    await tech.goto("/office");
    await expect(tech).toHaveURL(/\/account\?next=%2Foffice$/);
    await expect(tech.getByRole("heading", { name: names[0], exact: true })).toHaveCount(0);
    await expect(tech.getByRole("heading", { name: names[1], exact: true })).toBeVisible();
    await tech.goto("/account");
    // Changing the hidden destination cannot select an organization absent from memberships.
    await tech.getByRole("main").locator('input[name="organizationId"]').evaluate((input: HTMLInputElement) => { input.value = "a1000000-0000-4000-8000-000000000001"; });
    await tech.getByRole("button", { name: `Otvori ${names[1]}`, exact: true }).click();
    await expect(tech.getByRole("alert").filter({ hasText: "više nije dostupan" })).toBeVisible();
    await fixture.db.query("update hvac_private.invitations set expires_at=now()-interval '1 day' where organization_id=$1 and token_hash=$2", [organization, createHash("sha256").update(new URL(secondLink).pathname.split("/").at(-1)!).digest("hex")]);
    await tech.goto(secondLink);
    await expect(tech.getByRole("heading", { name: "Poziv nije dostupan", exact: true })).toBeVisible();
  } finally {
    await techContext.close();
    await unassignedContext.close();
    if (fixture) await fixture.dispose();
    try { await owner.dispose(); } finally {
      try { await member.dispose(); } finally { await unassigned.dispose(); }
    }
  }
});

test("controlled confirmation and recovery keep invitation context without sending mail", async ({ page, browser }, testInfo) => {
  test.setTimeout(90000);
  const owner = await createVerificationFixture();
  const recipient = await createVerificationFixture();
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const invited = await context.newPage();
  try {
    await confirm(page, owner);
    await createWorkspace(page, `UX06 Poziv ${randomUUID().slice(0, 6)}`);
    const url = await invite(page, recipient.email);
    const path = new URL(url).pathname;
    await page.goto(url);
    await page.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(page.getByText("Email naloga ne odgovara pozivu.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Promeni nalog", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
    await invited.goto(`/sign-up?next=${encodeURIComponent(path)}`);
    await expect(invited.locator('input[name="next"]')).toHaveValue(path);
    // Emulate the app-owned pending-signup hint; use real GoTrue verification tokens,
    // avoiding an outbound SMTP message or changes to the configured mail provider.
    await context.addCookies([{ name: "teren_auth_next", value: path, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await invited.goto(`/auth/confirm?token_hash=${recipient.tokenHash}&type=signup`);
    await expect(invited).toHaveURL(new RegExp(`${path}$`));
    await expect(invited.getByRole("button", { name: "Prihvati poziv", exact: true })).toBeVisible();
    await context.addCookies([{ name: "teren_auth_next", value: path, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Lax" }]);
    const recovery = await recipient.recoveryToken();
    await invited.goto(`/auth/confirm?token_hash=${recovery}&type=recovery`);
    await expect(invited.getByRole("heading", { name: "Izaberite novu lozinku." })).toBeVisible();
    await invited.getByLabel("Nova lozinka").fill(recipient.password + "-new");
    await invited.getByLabel("Ponovite lozinku").fill(recipient.password + "-new");
    await invited.getByRole("button", { name: "Sačuvaj novu lozinku", exact: true }).click();
    await expect(invited).toHaveURL(new RegExp(`/sign-in\\?message=password-updated&next=${encodeURIComponent(path)}$`));
    await invited.getByLabel("Email adresa").fill(recipient.email);
    await invited.getByLabel("Lozinka", { exact: true }).fill(recipient.password + "-new");
    await invited.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(invited).toHaveURL(new RegExp(`${path}$`));
    await invited.getByRole("button", { name: "Prihvati poziv", exact: true }).click();
    await expect(invited).toHaveURL(/\/today$/);
  } finally {
    await context.close();
    try { await owner.dispose(); } finally { await recipient.dispose(); }
  }
});
