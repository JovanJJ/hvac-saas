import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createVerificationFixture } from "./auth-fixtures";

// Enabled only by a loopback failure proxy in scripts/test-staff-ui.mjs.
// No environment switch is added to application code or database policy.
test("office/schedule failures preserve navigation, filters and retry recovery", async ({ page, request }, testInfo) => {
  const proxy = process.env.TEST_STAFF_FAILURE_PROXY_URL;
  test.skip(!proxy, "Requires the controlled local failure proxy");
  const user = await createVerificationFixture();
  try {
    await request.get(`${proxy}/__test/fail`);
    await page.goto(`/auth/confirm?token_hash=${user.tokenHash}&type=signup`);
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/onboarding");
    await page.getByLabel("Naziv firme").fill(`UX09 Greška ${randomUUID().slice(0, 8)}`);
    await page.getByRole("button", { name: "Napravi radni prostor", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kancelarija", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Učitavanje današnjih poseta" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Današnji raspored" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Nalozi za pregled" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Izdati izveštaji" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Zakaži posetu", exact: true })).toBeVisible();
    const query = "date=2026-11-24&view=week&cancelled=on";
    await page.goto(`/schedule?${query}`);
    await expect(page.getByRole("alert").filter({ hasText: "Raspored" })).toBeVisible();
    const menu = page.locator("summary:visible").filter({ hasText: "Meni tima" });
    if (await menu.isVisible()) await menu.click();
    await expect(page.getByRole("navigation", { name: "Navigacija tima" }).getByRole("link", { name: "Klijenti", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("schedule-unavailable.png"), fullPage: true });
    await request.get(`${proxy}/__test/recover`);
    await page.getByRole("button", { name: "Pokušaj ponovo", exact: true }).click();
    await expect(page.getByRole("region", { name: "Nedeljni raspored", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("date")).toBe("2026-11-24");
    expect(new URL(page.url()).searchParams.get("view")).toBe("week");
    await expect(page.getByRole("checkbox", { name: "Prikaži i otkazane posete" })).toBeChecked();
    await page.goto("/office");
    await expect(page.getByRole("heading", { name: "Današnje posete · 0", exact: true })).toBeVisible();
  } finally {
    await request.get(`${proxy}/__test/recover`);
    await user.dispose();
  }
});
