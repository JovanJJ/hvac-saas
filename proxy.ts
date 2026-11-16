import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/session";

// Refresh only. Authentication and membership checks live in the DAL and actions.
export function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    "/",
    "/account/:path*",
    "/onboarding",
    "/office/:path*",
    "/customers/:path*",
    "/sites/:path*",
    "/systems/:path*",
    "/schedule/:path*",
    "/visits/:path*",
    "/today/:path*",
    "/settings/:path*",
    "/invite/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ],
};
