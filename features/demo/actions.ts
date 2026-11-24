"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoSchema, type DemoState } from "./validation";

export async function submitDemo(_previous: DemoState, form: FormData): Promise<DemoState> {
  const parsed = demoSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return {
    status: "error",
    message: "Proverite unete podatke.",
    errors: parsed.error.flatten().fieldErrors,
  };
  try {
    const client = await createSupabaseServerClient();
    const input = parsed.data;
    const { data, error } = await client.rpc("submit_demo_request", {
      p_operation_id: input.operationId, p_name: input.name, p_email: input.email,
      p_company: input.company, p_plan: input.plan,
    });
    if (!error && data === input.operationId) return { status: "success" };
    if (error?.code === "PT429") return {
      status: "error", message: "Previše zahteva. Sačekajte pre ponovnog pokušaja.",
    };
  } catch { /* Contact details and provider diagnostics must never enter logs. */ }
  return { status: "error", message: "Zahtev nije poslat. Pokušajte ponovo." };
}
