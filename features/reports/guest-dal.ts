import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import type { CustomerReport } from "./model";
import { reportTokenSchema } from "./link-model";
import type { ReportReceipt } from "./receipt-model";
export type GuestReport = {
  receipt: ReportReceipt | null;
  linkId: string;
  revisionId: string;
  expiresAt: string;
  data: CustomerReport;
  artifact: { path: string; sha256: string; size: number };
};
// Always anonymous: a signed-in staff session must never broaden a guest capability.
export function guestClient(token: string) {
  const { url, key } = supabaseConfig();
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-report-token": token },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        }),
    },
  });
}
export async function guestReport(token: string) {
  if (!reportTokenSchema.safeParse(token).success) return null;
  const client = guestClient(token);
  const { data, error } = await client.rpc("guest_report", { p_token: token });
  if (error) throw new Error("Guest report unavailable");
  return data as GuestReport | null;
}
