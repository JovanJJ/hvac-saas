import "server-only";

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
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    runtimeEnv.SUPABASE_PUBLISHABLE_KEY ||
    runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase API configuration is missing.");
  if (!["http:", "https:"].includes(new URL(url).protocol))
    throw new Error("Invalid Supabase API URL.");
  // A self-hosted stack may use the legacy JWT anon key. Never accept an elevated key here.
  if (key.startsWith("sb_secret_"))
    throw new Error("A public Supabase client key is required.");
  if (key.split(".").length === 3) {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (payload.role !== "anon")
      throw new Error("The Supabase client key must use the anon role.");
  }
  return { url, key };
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
