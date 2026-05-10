import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { salon } = await getSalonForUser(supabase, user.id);
  if (!salon) {
    redirect("/setup");
  }

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("is_read", false);

  return (
    <DashboardShell salonId={salon.id}>
      <div className="flex min-h-screen">
        <DashboardSidebar unreadNotifications={count ?? 0} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        </main>
      </div>
    </DashboardShell>
  );
}
