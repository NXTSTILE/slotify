import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersTable } from "./customers-table";

export default async function CustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { salon } = await getSalonForUser(supabase, user.id);
  if (!salon) return null;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone, created_at")
    .eq("salon_id", salon.id)
    .order("created_at", { ascending: false });

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, customer_id, start_time, status, total_price")
    .eq("salon_id", salon.id);

  const stats: Record<string, { count: number; last?: string; revenue: number }> =
    {};
  for (const a of appts ?? []) {
    const cur = stats[a.customer_id] ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(a.total_price);
    if (!cur.last || a.start_time > cur.last) cur.last = a.start_time;
    stats[a.customer_id] = cur;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">From WhatsApp bookings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomersTable
            customers={customers ?? []}
            appointments={appts ?? []}
            stats={stats}
          />
        </CardContent>
      </Card>
    </div>
  );
}
