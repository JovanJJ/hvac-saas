import "server-only";
import { cache } from "react";
import { safeDestination } from "./validation";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const currentUser = cache(async () => {
  // Always remain request-scoped, including images built without runtime configuration.
  await connection();
  if (!hasSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at) return null;
  return { id: user.id, email: user.email ?? "" };
});

export async function requireUser(destination?: string) {
  const user = await currentUser();
  if (!user)
    redirect(
      destination
        ? `/sign-in?next=${encodeURIComponent(safeDestination(destination))}`
        : "/sign-in",
    );
  return user;
}

export async function accountWorkspaces() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // RLS independently enforces this scope for direct API requests.
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations!inner(id, display_name, time_zone, version)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error)
    throw new Error("Nije moguće učitati radne prostore. Pokušajte ponovo.");
  return (data ?? []).map((row) => ({
    role: row.role,
    organization: row.organizations,
  }));
}
