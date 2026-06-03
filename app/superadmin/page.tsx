import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SuperAdminView } from "./superadmin-view";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  try {
    // 1. Fetch platform statistics in parallel
    const [statsRes, salonsRes, usersRes, apptsRes] = await Promise.all([
      db.query(`
        SELECT 
          (SELECT COUNT(*)::int FROM public.users) as total_users,
          (SELECT COUNT(*)::int FROM public.salons) as total_salons,
          (SELECT COUNT(*)::int FROM public.appointments) as total_appointments,
          (SELECT COALESCE(SUM(total_price), 0)::float FROM public.appointments WHERE status = 'completed') as total_revenue
      `),
      db.query(`
        SELECT 
          s.id, 
          s.name, 
          s.phone, 
          s.address,
          s.city,
          s.owner_id, 
          s.created_at, 
          u.email as owner_email,
          COALESCE(COUNT(a.id), 0)::int as appointment_count,
          COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.total_price ELSE 0 END), 0)::float as revenue
        FROM public.salons s
        LEFT JOIN public.users u ON s.owner_id = u.id
        LEFT JOIN public.appointments a ON s.id = a.salon_id
        GROUP BY s.id, u.email
        ORDER BY s.created_at DESC
      `),
      db.query(`
        SELECT 
          u.id, 
          u.email, 
          u.is_super_admin, 
          u.created_at, 
          s.name as salon_name, 
          s.id as salon_id
        FROM public.users u
        LEFT JOIN public.salons s ON u.id = s.owner_id
        ORDER BY u.created_at DESC
      `),
      db.query(`
        SELECT 
          a.id, 
          a.start_time, 
          a.end_time,
          a.status, 
          a.total_price, 
          c.name as customer_name, 
          c.phone as customer_phone, 
          s.name as salon_name
        FROM public.appointments a
        LEFT JOIN public.customers c ON a.customer_id = c.id
        LEFT JOIN public.salons s ON a.salon_id = s.id
        ORDER BY a.start_time DESC
        LIMIT 100
      `)
    ]);

    const stats = statsRes.rows[0];
    const salons = salonsRes.rows;
    const users = usersRes.rows;
    const appointments = apptsRes.rows;

    return (
      <SuperAdminView
        currentUserId={session.userId}
        stats={stats}
        salons={salons}
        users={users}
        appointments={appointments}
      />
    );
  } catch (error: any) {
    return (
      <div className="p-6 max-w-4xl mx-auto my-10 bg-destructive/10 border border-destructive text-destructive rounded-lg space-y-4 shadow-sm">
        <h2 className="text-xl font-bold">Platform Administration Diagnostic Screen</h2>
        <p className="font-semibold text-sm">
          A server-side database exception occurred while aggregate-querying global tenant and appointment tables.
        </p>
        <div className="bg-background text-foreground p-4 rounded border font-mono text-xs overflow-auto max-h-96">
          <p className="font-bold">Error Message:</p>
          <p className="mb-4">{error.message}</p>
          {error.stack && (
            <>
              <p className="font-bold">Stack Trace:</p>
              <pre className="whitespace-pre-wrap">{error.stack}</pre>
            </>
          )}
        </div>
      </div>
    );
  }
}
