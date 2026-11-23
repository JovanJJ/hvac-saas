import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { externalMailSettings, mailComposeArgs } from "./mail-settings.mjs";
const docker = (args, env = process.env) => execFileSync("docker", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
let phase = "discover";
try {
  if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Use mail:external or mail:external:check.");
  const container = JSON.parse(docker(["inspect", process.env.SUPABASE_AUTH_CONTAINER || "supabase-auth"]))[0];
  const labels = container.Config.Labels;
  const directory = labels["com.docker.compose.project.working_dir"];
  const project = labels["com.docker.compose.project"];
  if (!directory || !project) throw new Error("Existing Supabase Compose labels are missing.");
  const envFile = resolve(directory, ".env");
  const appFile = resolve(".env");
  phase = "settings";
  const settings = externalMailSettings(parseEnv(readFileSync(appFile, "utf8")), parseEnv(readFileSync(envFile, "utf8")));
  const local = resolve("deploy/supabase-mail.local.yml");
  const overlay = resolve("deploy/supabase-mail.external.yml");
  const files = (labels["com.docker.compose.project.config_files"] || "").split(",").filter(file => file && file !== local && file !== overlay);
  const args = mailComposeArgs({ directory, project, files, overlay, envFile });
  const childEnv = { ...process.env, ...settings };
  phase = "compose";
  // Do not print resolved Compose output: it contains credentials.
  docker([...args, "config", "--quiet"], childEnv);
  if (process.argv.includes("--check")) {
    console.log("External SMTP configuration validated. No services changed and no email sent.");
  } else {
    phase = "apply";
    docker([...args, "up", "-d", "--no-deps", "auth"], childEnv);
    phase = "inbox-link";
    // Reread after Docker to preserve unrelated edits made while Auth was recreated.
    const current = readFileSync(appFile, "utf8");
    const updated = current.replace(/^LOCAL_AUTH_INBOX_URL[ \t]*=.*(?:\r?\n|$)/gm, "");
    if (updated !== current) writeFileSync(appFile, updated);
    console.log("Auth now uses external SMTP with email confirmation enabled. Restart Next.js if it showed the local inbox link. No test email was sent.");
  }
} catch (error) {
  // Only validation errors we authored are safe. Never print Docker/provider output.
  const safe = phase === "settings" && error instanceof Error && /^(Configure |SMTP_|Replace |Set APP_URL)/.test(error.message);
  console.error(phase === "inbox-link" ? "Auth was reconfigured for external SMTP; remove LOCAL_AUTH_INBOX_URL from the app .env and restart Next.js. No credentials were logged." : safe ? error.message : `External SMTP setup failed during ${phase}. No credentials were logged.`);
  process.exitCode = 1;
}
