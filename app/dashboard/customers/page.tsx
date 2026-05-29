import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersTable } from "./customers-table";

export default async function CustomersPage() {
  // 1. Fetch active session context
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Load salon info
  const salonRes = await db.query(
    "SELECT id FROM public.salons WHERE owner_id = $1 LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // 3. Query salon customers
  const custRes = await db.query(
    `SELECT id, name, phone, created_at 
     FROM public.customers 
     WHERE salon_id = $1 
     ORDER BY created_at DESC`,
    [salon.id]
  );
  const customers = custRes.rows;

  // 4. Query all appointments for stats calculation
  const aptRes = await db.query(
    "SELECT id, customer_id, start_time, status, total_price FROM public.appointments WHERE salon_id = $1",
    [salon.id]
  );
  const appts = aptRes.rows;

  // 5. Aggregate stats per customer
  const stats: Record<string, { count: number; last?: string; revenue: number }> = {};
  for (const a of appts) {
    const cur = stats[a.customer_id] ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(a.total_price);
    if (!cur.last || a.start_time > cur.last) {
      cur.last = a.start_time;
    }
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
            customers={customers}
            appointments={appts}
            stats={stats}
          />
        </CardContent>
      </Card>
    </div>
  );
}
