import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import pg from "pg";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

export async function withDatabase(run) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  // A pooler may emit an idle connection error separately from the active query.
  client.on("error", () => {});
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
export function reportFailure(error) {
  // SQL details and network errors can contain credentials or existing records.
  console.error(
    `Database operation failed${typeof error?.code === "string" ? ` (code ${error.code})` : ""}. No credentials were logged.`,
  );
  process.exitCode = 1;
}
