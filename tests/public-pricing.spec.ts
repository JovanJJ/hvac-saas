import { expect, test } from "@playwright/test";

for (const width of [360, 390, 1440]) {
  test(`pilot pricing and FAQ keyboard behavior at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/#cene");
    const prices = page.getByRole("region", { name: "Izaberite plan za svoj servis" });
    await expect(prices.getByText("Predložene cene za pilot", { exact: true })).toBeVisible();
    const team = prices.getByRole("article", { name: "Tim", exact: true });
    const solo = prices.getByRole("article", { name: "Solo", exact: true });
    await expect(team).toContainText("2.490 RSD");
    await expect(team).toContainText("Vlasnik i još četiri korisnika");
    await expect(solo).toContainText("1.290 RSD");
    await expect(solo).toContainText("Jedan korisnik");
    const first = (await team.boundingBox())!;
    const second = (await solo.boundingBox())!;
    if (width < 600) expect(second.y).toBeGreaterThan(first.y + first.height);
    else expect(second.x).toBeGreaterThan(first.x + first.width);
    for (const [card, plan] of [[team, "tim"], [solo, "solo"]] as const) {
      const link = card.getByRole("link");
      await expect(link).toHaveAttribute("href", `/demo?plan=${plan}`);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`pricing-${width}.png`), fullPage: true });

    const faq = page.getByRole("region", { name: "Pitanja servisera" });
    const items = faq.locator("details");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveAttribute("open", "");
    const invite = items.nth(1).locator("summary");
    await invite.focus();
    await page.keyboard.press("Enter");
    await expect(items.nth(1)).toHaveAttribute("open", "");
    await expect(invite).toBeFocused();
    await items.nth(2).locator("summary").focus();
    await page.keyboard.press("Space");
    await expect(items.nth(2)).toHaveAttribute("open", "");
    await expect(items.nth(1)).toHaveAttribute("open", "");
    await expect(items.nth(2)).toContainText("Potvrda prijema ne odobrava dodatne radove.");
    await page.keyboard.press("Space");
    await expect(items.nth(2)).not.toHaveAttribute("open");
    await items.nth(3).locator("summary").click();
    await expect(items.nth(3)).toContainText("predložena proba od 30 dana");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await faq.screenshot({ path: testInfo.outputPath(`faq-${width}.png`) });
  });
}

test("pricing plan survives navigation and rejects unknown or repeated values", async ({ page }) => {
  for (const [plan, label] of [["tim", "Tim"], ["solo", "Solo"]]) {
    await page.goto("/#cene");
    await page.getByRole("article", { name: label, exact: true }).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/demo\\?plan=${plan}$`));
    await expect(page.getByLabel("Plan koji vas zanima (opciono)")).toHaveValue(plan);
    await page.reload();
    await expect(page.getByLabel("Plan koji vas zanima (opciono)")).toHaveValue(plan);
  }
  for (const query of ["", "?plan=unknown", "?plan=TIM", "?plan=tim&plan=solo", "?plan=%3Cscript%3Ebad%3C%2Fscript%3E"]) {
    await page.goto(`/demo${query}`);
    await expect(page.getByRole("heading", { name: "Dogovorite demonstraciju" })).toBeVisible();
    await expect(page.getByLabel("Plan koji vas zanima (opciono)")).toHaveValue("");
  }
});

test("FAQ works without client JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/#pitanja");
    const faq = page.getByRole("region", { name: "Pitanja servisera" });
    const question = faq.locator("details").nth(1);
    await question.locator("summary").click();
    await expect(question).toHaveAttribute("open", "");
    await expect(question.getByText(/Vlasnik napravi poziv/)).toBeVisible();
  } finally { await context.close(); }
});
