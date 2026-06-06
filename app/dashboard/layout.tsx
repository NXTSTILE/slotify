import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Fetch user session
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Fetch corresponding salon info
  const salonRes = await db.query(
    "SELECT id, name FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // 3. Query unread notification count
  const notifRes = await db.query(
    "SELECT COUNT(*)::int as count FROM public.notifications WHERE salon_id = $1 AND is_read = false",
    [salon.id]
  );
  const unread = notifRes.rows[0].count || 0;

  return (
    <DashboardShell salonId={salon.id} unreadNotifications={unread}>
      <div className="flex min-h-[calc(100vh-3.5rem)] lg:min-h-screen">
        <DashboardSidebar unreadNotifications={unread} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </DashboardShell>
  );
}
