import { test, expect } from "@playwright/test";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";

test("office queue failures retain filters and retry without claiming an empty result", async ({ page, request }) => {
  const proxy = process.env.TEST_STAFF_FAILURE_PROXY_URL;
  test.skip(!proxy, "Requires the controlled local RPC failure proxy");
  const fixture = await createReportFixture();
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    for (const [path, label, empty, filter] of [
      [`/office/actions?site=${fixture.siteId}&due=all`, "Sledeće radnje", "Nema obaveza za izabrane filtere.", "site"],
      [`/office/handover?queue=billing&site=${fixture.siteId}&state=all`, "Potvrde i naplata", "Nema stavki za izabrane filtere.", "site"],
      ["/maintenance?state=paused", "Planovi održavanja", "Nema planova za izabrani prikaz.", "state"],
    ]) {
      await request.get(`${proxy}/__test/fail`);
      await page.goto(path);
      await expect(page.getByRole("main").getByRole("alert")).toContainText(label);
      await expect(page.getByText(empty, { exact: true })).toHaveCount(0);
      await request.get(`${proxy}/__test/recover`);
      await page.getByRole("button", { name: "Pokušaj ponovo", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get(filter)).toBe(new URL(path, "http://test.invalid").searchParams.get(filter));
    }
  } finally {
    await request.get(`${proxy}/__test/recover`);
    await fixture.dispose();
  }
});

test("unavailable links and receipts leave the frozen report readable and recover independently", async ({ page, request }) => {
  test.setTimeout(90000);
  const proxy = process.env.TEST_STAFF_FAILURE_PROXY_URL;
  test.skip(!proxy, "Requires the controlled local RPC failure proxy");
  const fixture = await createReportFixture();
  const worker = await workerClient();
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page.getByLabel("Lozinka", { exact: true }).fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.goto(`/visits/${fixture.visitId}/review`);
    await page.getByRole("button", { name: "Izdaj izveštaj", exact: true }).click();
    await expect(page).toHaveURL(/\/office\/reports\/[a-f0-9-]+$/);
    const id = page.url().split("/").at(-1)!;
    await processJob(worker, (await claimJob(worker, id))!);
    await request.get(`${proxy}/__test/fail`);
    await page.reload();
    await expect(page.getByRole("article", { name: "Izdat servisni izveštaj" })).toBeVisible();
    await expect(page.getByRole("region", { name: "PDF i deljenje", exact: true }).getByRole("alert")).toContainText("Linkovi za klijenta");
    const receipts = page.getByRole("region", { name: "Evidencija prijema" });
    await expect(receipts.getByRole("alert")).toContainText("Potvrde prijema");
    await expect(receipts.getByText("Nema potvrde prijema.", { exact: true })).toHaveCount(0);
    await request.get(`${proxy}/__test/recover`);
    await receipts.getByRole("button", { name: "Pokušaj ponovo", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Napravi link za klijenta" })).toBeVisible();
    await expect(receipts).toContainText("Nema potvrde prijema.");
  } finally {
    await request.get(`${proxy}/__test/recover`);
    worker.auth.stopAutoRefresh();
    await worker.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
});
