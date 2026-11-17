import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { workerClient } from "./client";
import { runOnce } from "./runner";
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
async function main() {
  const revisionIndex = process.argv.indexOf("--revision");
  const revisionId =
    revisionIndex >= 0 ? process.argv[revisionIndex + 1] : undefined;
  if (revisionIndex >= 0 && !/^[a-f0-9-]{36}$/i.test(revisionId || ""))
    throw new Error("invalid_revision");
  const client = await workerClient();
  try {
    do {
      await runOnce(client, revisionId);
      await writeFile("/tmp/report-worker-health", String(Date.now()));
      if (process.argv.includes("--once")) break;
      if (!stopping) await delay(2000);
    } while (!stopping);
  } finally {
    client.auth.stopAutoRefresh();
    await client.auth.signOut({ scope: "local" });
  }
}
main().catch(() => {
  console.error("Report worker stopped: configuration or queue unavailable.");
  process.exitCode = 1;
});
