import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import shellAssets from "../features/offline/shell-assets.json";

test("public metadata and local links are complete while auth, capabilities and fixture remain excluded", async ({ page, request }) => {
  for (const [path, title] of [["/", "Servisni nalog na telefonu"], ["/demo?plan=tim", "Dogovorite demonstraciju"]]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} | teren.`);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).not.toMatch(/\bnoindex\b/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    const bot = await request.get(path, { headers: { "User-Agent": "Twitterbot" } });
    const botHtml = await bot.text();
    expect(botHtml.match(/<link[^>]+rel="canonical"/g)).toHaveLength(1);
    const canonical = new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!);
    expect(canonical.pathname).toBe(new URL(path, "https://example.invalid").pathname);
    expect(canonical.search).toBe("");
    const image = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
    expect(image.pathname).toBe("/social/teren-preview.png");
    const asset = await request.get(image.pathname);
    expect(asset.status()).toBe(200);
    const dimensions = await sharp(await asset.body()).metadata();
    expect([dimensions.width, dimensions.height]).toEqual([1200, 630]);
    const links = await page.locator('a[href]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute("href")!))]);
    for (const href of links.filter(value => value.startsWith("/") || value.startsWith("#"))) {
      const target = new URL(href, page.url());
      expect(target.pathname).not.toMatch(/^\/(preview|privatnost|uslovi|office|r)(\/|$)/);
      const response = await request.get(target.pathname + target.search);
      expect(response.status(), target.pathname).toBeLessThan(400);
      if (target.hash && target.pathname === new URL(page.url()).pathname) {
        await expect(page.locator(`[id="${decodeURIComponent(target.hash.slice(1))}"]`)).toHaveCount(1);
      }
    }
  }
  for (const [path, title] of [["/sign-in", "Prijava"], ["/sign-up", "Registracija"], ["/forgot-password", "Oporavak lozinke"]]) {
    const response = await page.goto(path);
    await expect(page).toHaveTitle(`${title} | teren.`);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  }
  await page.goto("/r/not-a-valid-token");
  await expect(page.getByRole("heading", { name: "Link nije dostupan" })).toBeVisible();
  expect(await page.locator('meta[name="robots"]').first().getAttribute("content")).toContain("noindex");
  const fixture = await page.goto("/preview");
  expect(fixture?.status()).toBe(404);
  await expect(page.getByText("RN-2026-0142", { exact: false })).toHaveCount(0);
  expect((await request.get("/primeri/servisni-izvestaj.pdf")).status()).toBe(200);
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
  expect(await robots.text()).toContain("Allow: /$");
  for (const version of [1, 2]) {
    const offline = await request.get(`/offline/v${version}/index.html`);
    expect(offline.headers()["x-robots-tag"]).toContain("noindex");
    expect(await offline.text()).toContain('name="robots"');
  }
});

test("public pages retain stable layout, readable contrast and a complete route to demo at launch widths", async ({ page }, info) => {
  await page.addInitScript(() => {
    (window as unknown as { launchShifts: number }).launchShifts = 0;
    new PerformanceObserver(list => {
      for (const item of list.getEntries()) {
        const entry = item as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!entry.hadRecentInput) (window as unknown as { launchShifts: number }).launchShifts += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const hero = page.getByRole("region", { name: "Servisni nalog na telefonu. PDF izveštaj za klijenta." });
    await expect(page.getByRole("navigation", { name: "Navigacija u podnožju" }).getByRole("link", { name: "Prijava", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => hero.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
    const colors = await hero.getByRole("link", { name: "Zatraži demonstraciju", exact: true }).evaluate(el => { const style = getComputedStyle(el); return [style.color, style.backgroundColor]; });
    const luminance = (color: string) => {
      const components = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return .2126 * components[0] + .7152 * components[1] + .0722 * components[2];
    };
    const [a, b] = colors.map(luminance).sort((x, y) => y - x);
    expect((a + .05) / (b + .05)).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const shifts = await page.evaluate(() => (window as unknown as { launchShifts: number }).launchShifts);
    expect(shifts).toBeLessThanOrEqual(.1);
    const measurements = JSON.stringify({ width, observedCLS: shifts, primaryActionContrast: (a + .05) / (b + .05) }, null, 2);
    await writeFile(info.outputPath(`layout-${width}.json`), measurements);
    await info.attach(`layout-shift-${width}`, { body: measurements, contentType: "application/json" });
    // Load off-screen lazy illustrations before taking whole-page evidence.
    for (const image of await page.locator(".public-capture-link img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`launch-${width}.png`), fullPage: true });
    const demo = hero.getByRole("link", { name: "Zatraži demonstraciju", exact: true });
    await demo.focus(); await demo.press("Enter");
    await expect(page.getByRole("button", { name: "Pošalji zahtev", exact: true })).toBeVisible();
  }
});

test("installed worker leaves public navigation online and precaches only its declared public shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready; });
  await page.reload();
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dogovorite demonstraciju" })).toBeVisible();
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Prijava", exact: true })).toBeVisible();
  await page.goto("/r/not-a-valid-token");
  await expect(page.getByRole("heading", { name: "Link nije dostupan" })).toBeVisible();
  const paths = await page.evaluate(async () => {
    const all = await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)));
    return all.flat().sort();
  });
  expect(paths).toEqual([...shellAssets.files].sort());
  expect(paths.some(path => /^\/(api|r|auth|demo|sign-in)(\/|$)/.test(path))).toBe(false);
});
