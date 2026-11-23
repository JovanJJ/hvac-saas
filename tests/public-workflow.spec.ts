import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import captures from "../public/primeri/workflow.json";

test("worked example and real captures stay readable and accessible", async ({ page }, testInfo) => {
  const width = testInfo.project.name === "phone" ? 360 : 1440;
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/");
  const example = page.getByRole("region", { name: "Šta ostaje da se uradi posle posete?" });
  await expect(example.getByRole("listitem")).toHaveCount(2);
  await expect(example).toContainText("4 planirana sistema · 3 pregledana · 2 otvorene stavke");
  await expect(example).toContainText("Servis šalje ponudu za popravku.");
  await expect(example).toContainText("Klijent potvrđuje pristup i novi termin.");
  const workflow = page.getByRole("region", { name: "Od zakazane posete do poslatog izveštaja" });
  const links = workflow.getByRole("link", { name: /^Uvećaj snimak/ });
  await expect(links).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    const link = links.nth(index);
    await link.scrollIntoViewIfNeeded();
    const image = link.locator("img");
    await expect(image).toHaveAttribute("loading", "lazy");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    if (index !== 1) expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(width < 900 ? "-mobile.webp" : "-desktop.webp");
    await link.focus();
    expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  }
  await expect(page.getByRole("button", { name: /Pusti demonstraciju|Pogledaj primer servisne posete/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`worked-example-${width}.png`), fullPage: true });
});

test("public captures have reviewed hashes and no private source identifiers", async ({ request }) => {
  expect(captures.fictional).toBe(true);
  expect(captures.scenario).toBe("RN-2026-0142");
  expect(captures.totals).toEqual({ planned: 4, inspected: 3, actions: 2 });
  expect(JSON.stringify(captures)).not.toMatch(/verify-|hvac\.example|token_hash|https?:|\/visits\/|\/auth|internalNote/);
  for (const asset of Object.values(captures.assets)) {
    const response = await request.get(asset.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(asset.sha256);
  }
});
