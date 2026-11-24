import { expect, test } from "@playwright/test";

const title = "Servisni nalog na telefonu. PDF izveštaj za klijenta.";

for (const width of [360, 390, 768, 1440]) {
  test(`public entry and keyboard navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Pređi na sadržaj" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    const mobile = width < 1100;
    const nav = page.getByRole("navigation", { name: mobile ? "Navigacija na telefonu" : "Glavna navigacija", exact: true });
    await expect(nav.getByRole("link", { name: "Prijava", exact: true })).toBeVisible();
    if (mobile) {
      const toggle = nav.getByRole("button", { name: "Meni", exact: true });
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name: "Registracija" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
    }
    await expect(nav.getByRole("link", { name: "Registracija" })).toBeVisible();
    await nav.getByRole("link", { name: "Kako radi", exact: true }).click();
    await expect(page).toHaveURL(/\/#kako-radi$/);
    if (mobile) await expect(nav.getByRole("button", { name: "Meni" })).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`public-${width}.png`), fullPage: true });
    if (mobile) await nav.getByRole("button", { name: "Meni" }).click();
    await nav.getByRole("link", { name: "Registracija" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });
}

test("protected visit, invitation and invalid report keep their direct destinations", async ({ page }) => {
  const visit = "/visits/00000000-0000-4000-8000-000000000001";
  await page.goto(visit);
  await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(visit)}$`));
  const invitation = `/invite/${"a".repeat(43)}`;
  await page.goto(`/sign-in?next=${encodeURIComponent(invitation)}`);
  await page.getByRole("link", { name: "Napravi nalog", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sign-up\\?next=${encodeURIComponent(invitation)}$`));
  await page.goto("/r/not-a-valid-token");
  await expect(page.getByRole("heading", { name: "Link nije dostupan" })).toBeVisible();
  await expect(page).toHaveURL(/\/r\/not-a-valid-token$/);
  await expect(page.getByRole("link", { name: "teren. — početna" })).toHaveCount(0);
});

for (const [email, label, destination] of [
  ["owner.a@hvac.example.invalid", "Kancelarija", "/office"],
  ["owner.b@hvac.example.invalid", "Kancelarija", "/office"],
  ["technician.a@hvac.example.invalid", "Danas", "/today"],
  ["unassigned@hvac.example.invalid", "Napravi radni prostor", "/onboarding"],
]) {
  test(`signed-in public shortcut for ${email}`, async ({ page }, testInfo) => {
    test.skip(!process.env.SEED_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL, "Requires fictional development seed identities.");
    if (testInfo.project.name === "phone") await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill(email);
    await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navigacija u podnožju" });
    await expect(nav.getByRole("link", { name: "Prijava", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Registracija" })).toHaveCount(0);
    const header = page.getByRole("navigation", { name: testInfo.project.name === "phone" ? "Navigacija na telefonu" : "Glavna navigacija", exact: true });
    await expect(header.getByRole("link", { name: label, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("public-signed-in.png"), fullPage: true });
    await header.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

test("demo request is reachable anonymously", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dogovorite demonstraciju" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pošalji zahtev" })).toBeVisible();
});
