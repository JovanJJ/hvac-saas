import "server-only";
import type { Database } from "./database.types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authCookieOptions, supabaseConfig } from "./config";

// Server Components read only; Proxy refreshes their cookies before rendering.
// Actions and Route Handlers opt into writes and propagate any write failure.
export async function createSupabaseServerClient({ writable = false } = {}) {
  // Supabase reads the clock while constructing sessions; exclude the entire client from prerendering.
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url, key, {
    cookieOptions: authCookieOptions(),
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        if (writable)
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
      },
    },
  });
}
