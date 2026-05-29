"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Scissors } from "lucide-react";
import { MobileSidebar } from "@/components/dashboard-sidebar";

export function DashboardShell({
  salonId,
  unreadNotifications,
  children,
}: {
  salonId: string;
  unreadNotifications: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Standard direct database setups don't have instant WebSocket publications by default.
    // Setting up a robust 30-second polling interval keeps the dashboard fresh.
    const interval = setInterval(() => {
      router.refresh();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [router]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 font-bold text-primary">
          <Scissors className="h-4 w-4" />
          Nxtstile
        </div>
        {unreadNotifications > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        )}
      </header>

      <MobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        unreadNotifications={unreadNotifications}
      />

      {children}
    </>
  );
}
