import "server-only";
import { configuredAppOrigin } from "@/lib/app-origin";
import { supabaseSettings } from "./settings";

// Server-only dynamic lookup keeps container configuration at runtime.
const runtimeEnv = process.env;

export function hasSupabaseConfig() {
  return Boolean(
    runtimeEnv.NEXT_PUBLIC_SUPABASE_URL &&
      (runtimeEnv.SUPABASE_PUBLISHABLE_KEY ||
        runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function supabaseConfig() {
  return supabaseSettings(runtimeEnv);
}

export function appOrigin() { return configuredAppOrigin(runtimeEnv); }

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appOrigin().startsWith("https://"),
    path: "/",
  };
}
