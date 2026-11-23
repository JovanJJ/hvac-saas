import { expect, test } from "@playwright/test";

for (const width of [360, 390, 1440]) {
  test(`landing reading order and reference layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    const hero = main.getByRole("region", {
      name: "Servisni nalog na telefonu. PDF izveštaj za klijenta.",
    });
    const action = hero.getByRole("link", { name: "Zatraži demonstraciju" });
    const panel = hero.getByRole("figure");
    await expect(action).toBeVisible();
    const actionBox = (await action.boundingBox())!;
    expect(actionBox.height).toBeGreaterThanOrEqual(44);
    const headingBox = (await hero.getByRole("heading").boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    if (width < 900) {
      expect(panelBox.y).toBeGreaterThan(actionBox.y + actionBox.height);
    } else {
      expect(panelBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
    }

    const steps = main.getByRole("region", {
      name: "Od zakazane posete do poslatog izveštaja",
    }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    const first = (await steps.nth(0).boundingBox())!;
    const second = (await steps.nth(1).boundingBox())!;
    if (width < 900) expect(second.y).toBeGreaterThan(first.y + first.height);
    else expect(second.x).toBeGreaterThan(first.x + first.width);

    await expect(hero.getByRole("link", { name: "Otvori primer PDF-a" })).toHaveAttribute("href", "/primeri/servisni-izvestaj.pdf");
    await expect(panel.getByText("4 planirana sistema · 3 pregledana · 2 otvorene stavke", { exact: true })).toBeVisible();
    const preview = panel.getByRole("img");
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await preview.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain(width < 900 ? "servisni-izvestaj-mobile.webp" : "servisni-izvestaj-desktop.webp");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true });

    await action.focus();
    expect(await action.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("Ova stranica trenutno ne prima zahteve.", { exact: false })).toBeVisible();
  });
}

test("desktop 200 percent reflow equivalent and reduced motion remain usable", async ({ browser }, testInfo) => {
  // 1440 physical pixels / 2 = 720 CSS pixels. This checks reflow, not native browser chrome zoom.
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 720, height: 500 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Meni", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Navigacija na telefonu" }).getByRole("link", { name: "Registracija" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Meni", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".public-site").evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("landing-reflow-200.png"), fullPage: true });
  } finally {
    await context.close();
  }
});
