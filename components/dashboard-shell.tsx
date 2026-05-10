"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Menu, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
    const supabase = createClient();
    const channel = supabase
      .channel(`dash-${salonId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `salon_id=eq.${salonId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `salon_id=eq.${salonId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [salonId, router]);

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
          Slotify
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
