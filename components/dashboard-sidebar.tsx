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
  ListOrdered,
  Users,
  X,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays, exact: false },
  { href: "/dashboard/services", label: "Services", icon: Scissors, exact: false },
  { href: "/dashboard/queues", label: "Queues", icon: ListOrdered, exact: false },
  { href: "/dashboard/customers", label: "Customers", icon: Users, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

function NavLinks({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar — always visible on lg+ */
export function DashboardSidebar({
  unreadNotifications,
}: {
  unreadNotifications: number;
}) {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Scissors className="h-4 w-4 text-primary" />
        <span className="font-bold tracking-tight text-primary">Nxtstile</span>
        {unreadNotifications > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        ) : null}
      </div>

      <NavLinks />

      {/* Sign out */}
      <div className="border-t p-2">
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            size="sm"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}

/** Mobile drawer sidebar — controlled externally */
export function MobileSidebar({
  open,
  onClose,
  unreadNotifications,
}: {
  open: boolean;
  onClose: () => void;
  unreadNotifications: number;
}) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-xl lg:hidden">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Scissors className="h-4 w-4 text-primary" />
          <span className="font-bold tracking-tight text-primary">Nxtstile</span>
          {unreadNotifications > 0 ? (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          ) : null}
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 hover:bg-sidebar-accent"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <NavLinks onNav={onClose} />

        <div className="border-t p-2">
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              size="sm"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
    </>
  );
}
