// Pure settings shared by server-only app configuration and the separate worker.
export function supabaseSettings(
  runtimeEnv: Record<string, string | undefined>,
) {
  const url = runtimeEnv.SUPABASE_INTERNAL_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
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
