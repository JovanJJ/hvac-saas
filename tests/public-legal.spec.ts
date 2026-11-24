import { expect, test } from "@playwright/test";

const blocked = process.env.TEST_LEGAL_PUBLICATION_BLOCKED === "true";
const documents = [["/privatnost", "Privatnost"], ["/uslovi", "Uslovi korišćenja"]] as const;

test("unreviewed legal drafts stay closed in production", async ({ page, request }) => {
  test.skip(!blocked, "Production acceptance only");
  for (const [path] of documents) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Radna verzija za lokalnu proveru");
  }
  for (const path of ["/", "/demo", "/sign-up"]) {
    await page.goto(path);
    await expect(page.locator('a[href="/privatnost"], a[href="/uslovi"]')).toHaveCount(0);
  }
});

test.describe("local legal drafts", () => {
  test.skip(blocked, "Operator/legal review remains a production publication gate");

  test("anonymous reading, dated draft, contents and narrow reflow", async ({ page }, testInfo) => {
    for (const [path, title] of documents) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Status dokumenta" })).toContainText("Radna verzija za lokalnu proveru");
      await expect(page.locator("article time")).toHaveAttribute("datetime", "2026-11-24");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      const contents = page.getByRole("navigation", { name: "Sadržaj dokumenta" });
      const links = contents.getByRole("link");
      expect(await links.count()).toBeGreaterThanOrEqual(6);
      for (const link of await links.all()) {
        const target = await link.getAttribute("href");
        await expect(page.locator(target!)).toHaveCount(1);
      }
      await links.last().focus();
      await page.keyboard.press("Enter");
      await expect(page.locator((await links.last().getAttribute("href"))!)).toBeFocused();
      // 320 CSS px also exercises the width equivalent of 200% zoom on a 640 px viewport.
      for (const width of [320, 360, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}.png`), fullPage: true });
      }
      const content = await page.getByRole("main").getByRole("article").innerText();
      expect(content).not.toMatch(/\[[^\]]+\]|example\.com|\bTODO\b|\bTBD\b/);
      await expect(page.getByRole("link", { name: "Prijava", exact: true }).first()).toBeVisible();
    }
  });

  test("registration, demo, pricing and footer reach the same documents", async ({ page }) => {
    await page.goto("/sign-up");
    const authLinks = page.getByRole("navigation", { name: "Pravni podaci" });
    await authLinks.getByRole("link", { name: "Privatnost", exact: true }).click();
    await expect(page).toHaveURL(/\/privatnost$/);
    await page.goto("/demo");
    await page.getByRole("link", { name: "Kako koristimo podatke" }).click();
    await expect(page).toHaveURL(/\/privatnost$/);
    await page.goto("/#cene");
    const pricing = page.getByRole("region", { name: "Izaberite plan za svoj servis" });
    await pricing.getByRole("link", { name: "Uslovi korišćenja", exact: true }).click();
    await expect(page).toHaveURL(/\/uslovi$/);
    await expect(page.getByRole("main").getByRole("article")).toContainText("2.490 RSD");
    await expect(page.getByRole("main").getByRole("article")).toContainText("1.290 RSD");
    await expect(page.getByRole("main").getByRole("article")).toContainText("30 dana bez kartice");
    await expect(page.getByRole("main").getByRole("article")).toContainText("Poreski tretman");
    await page.locator("footer").getByRole("link", { name: "Privatnost", exact: true }).click();
    await expect(page).toHaveURL(/\/privatnost$/);
    await expect(page.getByRole("main").getByRole("article")).toContainText("IndexedDB");
    await expect(page.getByRole("main").getByRole("article")).toContainText("Gmail SMTP");
    await expect(page.getByRole("main").getByRole("article")).toContainText("ne šalje automatsku imejl poruku");
  });

  test("legal reading works without JavaScript", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
    try {
      const page = await context.newPage();
      for (const [path] of documents) {
        await page.goto(path);
        const link = page.getByRole("navigation", { name: "Sadržaj dokumenta" }).getByRole("link").last();
        const href = await link.getAttribute("href");
        await link.click();
        await expect(page.locator(href!)).toBeInViewport();
      }
    } finally { await context.close(); }
  });
});
