"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function DashboardShell({
  salonId,
  children,
}: {
  salonId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

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

  return <>{children}</>;
}
