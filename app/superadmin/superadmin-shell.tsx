"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutSuperadmin } from "@/app/actions/superadmin-auth";
import {
  Shield,
  Building,
  Users,
  CalendarDays,
  ArrowLeft,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const links = [
  { href: "/superadmin", label: "Overview", icon: Shield, exact: true },
];

function SuperAdminNavLinks({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Platform Management
      </div>
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.01]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}

      <div className="mt-6 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Navigation
      </div>
      <Link
        href="/dashboard"
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4 shrink-0 text-primary" />
        Return to Salon
      </Link>
    </nav>
  );
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Keep data fresh by executing background router updates every 30 seconds
    const interval = setInterval(() => {
      router.refresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center gap-3 border-b bg-background px-4 lg:hidden shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 hover:bg-accent text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 font-bold text-primary">
          <Shield className="h-5 w-5 fill-primary/10" />
          <span className="tracking-tight">Nxtstile SuperAdmin</span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-card text-card-foreground shadow-sm">
        {/* Brand Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b px-6">
          <Shield className="h-5 w-5 text-primary fill-primary/10 animate-pulse" />
          <span className="font-bold tracking-tight text-primary text-base">Nxtstile Admin</span>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 overflow-y-auto py-4">
          <SuperAdminNavLinks />
        </div>

        {/* Logout */}
        <div className="border-t p-4 bg-muted/20">
          <form action={logoutSuperadmin}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              size="sm"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-all duration-300"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          {/* Drawer Panel */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card text-card-foreground shadow-2xl lg:hidden transform transition-transform duration-300 ease-in-out">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 font-bold text-primary">
                <Shield className="h-5 w-5 fill-primary/10" />
                <span className="tracking-tight">Nxtstile Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <SuperAdminNavLinks onNav={() => setMobileOpen(false)} />
            </div>

            <div className="border-t p-4 bg-muted/20">
              <form action={logoutSuperadmin}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  size="sm"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </form>
            </div>
          </aside>
        </>
      )}

      {/* Page Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
