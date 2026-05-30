import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getStaffWithServices } from "@/app/actions/staff";
import { StaffManager } from "./staff-manager";
import { Users } from "lucide-react";

export const metadata = {
  title: "Staff — Nxtstile",
  description: "Manage your team and assign the services each staff member specialises in.",
};

export default async function StaffPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const salonRes = await db.query(
    "SELECT id, name FROM public.salons WHERE owner_id = $1 LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) redirect("/setup");

  // All active services for the service-picker
  const svcRes = await db.query(
    "SELECT id, name FROM public.services WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC",
    [salon.id]
  );
  const allServices: { id: string; name: string }[] = svcRes.rows;

  // Staff with their service assignments
  const staffList = await getStaffWithServices(salon.id);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Add your team and assign the services they specialise in. During booking, the
          system picks the staff member with the earliest available slot — specialists are
          preferred over all-rounders.
        </p>
      </div>

      {/* Assignment rules info card */}
      <div className="rounded-xl border bg-muted/40 px-5 py-4 text-sm space-y-1">
        <p className="font-medium">How auto-assignment works</p>
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-xs">
          <li>
            <strong>Closest slot first</strong> — the staff member whose next free slot starts
            soonest after the session start is assigned.
          </li>
          <li>
            <strong>Specialists over generalists</strong> — when multiple staff are equally
            available, staff with fewer total services (specialists) are preferred; all-rounders
            are used last.
          </li>
        </ol>
      </div>

      {allServices.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No active services found. Add services first before assigning staff.
        </div>
      ) : (
        <StaffManager initialStaff={staffList} allServices={allServices} />
      )}
    </div>
  );
}
