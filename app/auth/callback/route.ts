import { rotateOfflineEpoch } from "@/lib/offline/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/supabase/config";
import { safeDestination } from "@/features/auth/validation";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  let path = "/sign-in?error=invalid-link";
  if (code && code.length <= 4096) {
    try {
      const supabase = await createSupabaseServerClient({ writable: true });
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await rotateOfflineEpoch();
        path = safeDestination(request.nextUrl.searchParams.get("next") || (await cookies()).get("teren_auth_next")?.value);
        if (path !== "/reset-password") (await cookies()).delete("teren_auth_next");
      }
    } catch {
      /* Never echo auth codes or provider errors. */
    }
  }
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
