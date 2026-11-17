import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/session";

// Refresh only. Authentication and membership checks live in the DAL and actions.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/r/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  return refreshSession(request);
}

export const config = {
  matcher: [
    "/r/:path*",
    "/api/field/:path*",
    "/api/office/:path*",
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
