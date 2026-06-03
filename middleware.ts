import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/jwt";

/**
 * Global application middleware to guard routes and protect dashboard actions.
 * Runs in the ultra-fast Next.js Edge Runtime.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. Retrieve the session cookie
  const sessionCookie = request.cookies.get("session")?.value;
  
  // 2. Cryptographically decrypt and verify the JWT
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  // 3. Route guarding logic
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isSuperAdminRoute = pathname.startsWith("/superadmin");
  const isSetupRoute = pathname.startsWith("/setup");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  // Redirect unauthenticated users trying to access protected routes
  if ((isDashboardRoute || isSuperAdminRoute || isSetupRoute) && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect already authenticated users away from auth gates (login/signup)
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Matches all dashboard, authentication, onboarding, and superadmin routes
  matcher: ["/dashboard/:path*", "/superadmin/:path*", "/login", "/signup", "/setup"],
};
