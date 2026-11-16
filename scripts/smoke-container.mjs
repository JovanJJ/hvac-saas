import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

const name = `hvac-m1-smoke-${randomUUID().slice(0, 8)}`;
const port = Number(process.env.SMOKE_PORT || 3002);
const docker = (args, env) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
const runtime = {
  ...process.env,
  APP_URL: `http://localhost:${port}`,
  // Container-to-host gateway. The M1a Supabase client runs exclusively on the server.
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.SMOKE_SUPABASE_URL || "http://host.docker.internal:8000",
};
let started = false;
let browser;
try {
  docker(
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--add-host=host.docker.internal:host-gateway",
      "-p",
      `127.0.0.1:${port}:3000`,
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--env",
      "APP_URL",
      "--env",
      "NEXT_PUBLIC_SUPABASE_URL",
      "--env",
      "SUPABASE_PUBLISHABLE_KEY",
      "--env",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "--env",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.SMOKE_IMAGE || "hvac-saas:m1b",
    ],
    runtime,
  );
  started = true;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(`http://localhost:${port}/sign-in`)).ok) break;
    } catch {
      /* Startup can take a moment. */
    }
    await setTimeout(500);
  }
  expect(docker(["exec", name, "id", "-u"]).trim() !== "0").toBe(true);
  expect(
    docker([
      "exec",
      name,
      "node",
      "-e",
      "process.stdout.write(String(require('fs').existsSync('/app/.env')))",
    ]).trim(),
  ).toBe("false");
  expect((await fetch(`http://localhost:${port}/preview`)).status).toBe(404);
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/account`);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
  await page
    .getByLabel("Lozinka", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kancelarija", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Primer servis B")).toHaveCount(0);
  await page.goto(`http://localhost:${port}/`);
  await expect(page).toHaveURL(/\/office$/);
  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  console.log(
    "PASS: production image runs non-root without .env, runtime configuration works, sign-in/scoped landing/sign-out pass, and /preview returns 404.",
  );
} catch {
  console.error(
    "Container smoke test failed. No credentials or session values were logged.",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (started) docker(["stop", name]);
}
