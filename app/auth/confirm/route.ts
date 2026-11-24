import { rotateOfflineEpoch } from "@/lib/offline/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { safeDestination } from "@/features/auth/validation";
import { appOrigin } from "@/lib/supabase/config";

// Set the Supabase signup/recovery email templates to this endpoint (see README).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  let path = "/sign-in?error=invalid-link";
  if (
    tokenHash &&
    tokenHash.length <= 512 &&
    (type === "signup" || type === "email" || type === "recovery")
  ) {
    try {
      const supabase = await createSupabaseServerClient({ writable: true });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (!error) {
        await rotateOfflineEpoch();
        path =
          type === "recovery"
            ? "/reset-password"
            : safeDestination((await cookies()).get("teren_auth_next")?.value);
        if (type !== "recovery") (await cookies()).delete("teren_auth_next");
      }
    } catch {
      /* Never echo tokens or provider errors. */
    }
  }
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
