import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/jwt";
import { jwtVerify } from "jose";

/**
 * Global application middleware to guard routes and protect dashboard actions.
 * Runs in the ultra-fast Next.js Edge Runtime.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Since public registration is disabled, redirect /signup to /login
  if (pathname === "/signup") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  
  // Route guarding logic
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isSuperAdminRoute = pathname.startsWith("/superadmin");
  const isSuperAdminLoginRoute = pathname === "/superadmin/login";
  const isSetupRoute = pathname.startsWith("/setup");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  // --- Superadmin Auth ---
  if (isSuperAdminRoute) {
    const saSessionCookie = request.cookies.get("superadmin_session")?.value;
    let saSession = null;
    if (saSessionCookie) {
      try {
        const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-for-dev");
        const { payload } = await jwtVerify(saSessionCookie, JWT_SECRET, { algorithms: ['HS256'] });
        saSession = payload;
      } catch (e) {
        saSession = null;
      }
    }

    if (!saSession && !isSuperAdminLoginRoute) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    
    if (saSession && isSuperAdminLoginRoute) {
      return NextResponse.redirect(new URL("/superadmin", request.url));
    }
    
    // Allow superadmin route requests through
    return NextResponse.next();
  }

  // --- Normal Salon Owner Auth ---
  const sessionCookie = request.cookies.get("session")?.value;
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  // Redirect unauthenticated users trying to access protected routes
  if ((isDashboardRoute || isSetupRoute) && !session) {
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
