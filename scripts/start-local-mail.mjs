import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { appendFileSync, readFileSync } from "node:fs";
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
try {
  const container = JSON.parse(docker(["inspect", "supabase-auth"]))[0];
  const labels = container.Config.Labels;
  const directory = labels["com.docker.compose.project.working_dir"];
  const project = labels["com.docker.compose.project"];
  const files = labels["com.docker.compose.project.config_files"].split(",");
  const overlay = resolve("deploy/supabase-mail.local.yml");
  const args = [
    "compose",
    "--project-directory",
    directory,
    "--env-file",
    resolve(directory, ".env"),
    "-p",
    project,
  ];
  for (const file of [...new Set([...files, overlay])]) args.push("-f", file);
  args.push("up", "-d", "--no-deps", "mail", "auth");
  // Only Auth is recreated. Existing database volumes and unrelated services are untouched.
  docker(args);
  const appEnv = readFileSync(".env", "utf8");
  if (!/^LOCAL_AUTH_INBOX_URL\s*=/m.test(appEnv))
    appendFileSync(".env", "\nLOCAL_AUTH_INBOX_URL=http://localhost:9000\n");
  console.log(
    "Local confirmation inbox: http://localhost:9000. Only Auth/mail services updated.",
  );
} catch {
  console.error(
    "Could not configure the local Auth inbox. Check Docker access and the existing Supabase Compose project.",
  );
  process.exitCode = 1;
}
