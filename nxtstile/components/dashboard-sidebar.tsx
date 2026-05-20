"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Scissors,
  Settings,
  Users,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/dashboard/services", label: "Services", icon: Scissors },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar({
  unreadNotifications,
}: {
  unreadNotifications: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b px-4 font-semibold tracking-tight">
        Nxtstile
        {unreadNotifications > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === href
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/60"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-2">
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" className="w-full justify-start gap-2" size="sm">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
