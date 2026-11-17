import { supabaseSettings } from "@/lib/supabase/settings";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
export async function workerClient() {
  const { REPORT_WORKER_EMAIL: email, REPORT_WORKER_PASSWORD: password } =
    process.env;
  const { url, key } = supabaseSettings(process.env);
  if (!email || !password) throw new Error("worker_configuration");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: true },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)])
            : AbortSignal.timeout(30000),
        }),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    client.auth.stopAutoRefresh();
    throw new Error("worker_authentication");
  }
  return client;
}
export type WorkerClient = Awaited<ReturnType<typeof workerClient>>;
