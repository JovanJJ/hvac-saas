import "server-only";
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

export function appOrigin() {
  const value =
    runtimeEnv.APP_URL ||
    (runtimeEnv.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!value) throw new Error("APP_URL is required in production.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_URL must be an application origin.");
  }
  if (
    runtimeEnv.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("Production APP_URL must use HTTPS.");
  }
  return url.origin;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appOrigin().startsWith("https://"),
    path: "/",
  };
}
