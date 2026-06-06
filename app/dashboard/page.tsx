import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SALON_TIMEZONE } from "@/lib/constants";
import { markNotificationsReadAction } from "@/app/actions/salon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WalkInButton } from "@/components/walk-in-button";

export default async function DashboardHomePage() {
  // 1. Fetch user session
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  let salon: any = null;

  try {
    // 2. Fetch salon details
    const salonRes = await db.query(
      "SELECT id, name FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
      [session.userId]
    );
    salon = salonRes.rows[0];
  } catch (error: any) {
    return (
      <div className="p-6 max-w-2xl mx-auto my-10 bg-destructive/10 border border-destructive text-destructive rounded-lg space-y-4">
        <h2 className="text-xl font-bold">Server-Side Exception Captured</h2>
        <p className="font-semibold text-sm">This diagnostic screen is displayed to assist in identifying issues in the live environment.</p>
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

  // Perform redirect strictly OUTSIDE the try/catch block
  if (!salon) {
    redirect("/setup");
  }

  try {
    const start = new Date();
    const dayStart = format(toZonedTime(start, SALON_TIMEZONE), "yyyy-MM-dd");
    const zStart = new Date(`${dayStart}T00:00:00+05:30`).toISOString();
    const zEnd = new Date(`${dayStart}T23:59:59+05:30`).toISOString();

    // 3. Fetch today's appointments
    const aptRes = await db.query(
      `SELECT id, start_time, end_time, status, total_price, customer_id 
       FROM public.appointments 
       WHERE salon_id = $1 
       AND start_time >= $2 
       AND start_time <= $3 
       ORDER BY start_time ASC`,
      [salon.id, zStart, zEnd]
    );
    const aptRows = aptRes.rows;

    // 4. Fetch corresponding customers using SQL parameterized arrays
    const custIds = Array.from(new Set(aptRows.map((a) => a.customer_id)));
    let custRows: any[] = [];
    if (custIds.length > 0) {
      const custRes = await db.query(
        "SELECT id, name, phone FROM public.customers WHERE id = ANY($1::uuid[])",
        [custIds]
      );
      custRows = custRes.rows;
    }
    const custById = new Map(custRows.map((c) => [c.id, c]));

    const todayAppointments = aptRows.map((a) => ({
      ...a,
      customer: custById.get(a.customer_id),
    }));

    // 5. Aggregate today's completed revenue directly in Postgres
    const revRes = await db.query(
      `SELECT COALESCE(SUM(total_price), 0)::float as revenue 
       FROM public.appointments 
       WHERE salon_id = $1 
       AND status = 'completed' 
       AND start_time >= $2 
       AND start_time <= $3`,
      [salon.id, zStart, zEnd]
    );
    const revenue = revRes.rows[0].revenue || 0;

    const bookingsCount = todayAppointments.length;

    const upcoming = todayAppointments.filter(
      (a) => a.status === "pending" || a.status === "confirmed"
    );
    const next = upcoming[0];

    // 6. Query unread alerts
    const unreadRes = await db.query(
      "SELECT COUNT(*)::int as count FROM public.notifications WHERE salon_id = $1 AND is_read = false",
      [salon.id]
    );
    const unread = unreadRes.rows[0].count || 0;

    // 7. Load active services list for Walk-In booking dialog
    const svcRes = await db.query(
      "SELECT id, name, price FROM public.services WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC",
      [salon.id]
    );
    const services = svcRes.rows;

    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{salon.name}</h1>
            <p className="text-muted-foreground text-sm">
              Today · {format(toZonedTime(start, SALON_TIMEZONE), "EEEE, d MMM yyyy")}{" "}
              ({SALON_TIMEZONE})
            </p>
          </div>
          <WalkInButton services={services} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today&apos;s bookings
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{bookingsCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">₹{revenue.toFixed(2)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unread alerts
              </CardTitle>
              {unread > 0 && (
                <form action={markNotificationsReadAction}>
                  <button type="submit" className="text-xs text-primary hover:underline">
                    Mark all read
                  </button>
                </form>
              )}
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{unread}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Next appointment</CardTitle>
            <Link
              href="/dashboard/appointments"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Calendar
            </Link>
          </CardHeader>
          <CardContent>
            {next ? (
              <div className="space-y-1">
                <p className="font-medium">
                  {format(toZonedTime(new Date(next.start_time), SALON_TIMEZONE), "hh:mm a")}{" "}
                  · {next.customer?.name ?? "Customer"}
                </p>
                <p className="text-sm text-muted-foreground">{next.customer?.phone ?? ""}</p>
                <Badge variant="secondary">{next.status}</Badge>
              </div>
            ) : (
              <p className="text-muted-foreground">No more appointments today.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppointments.length === 0 ? (
              <p className="text-muted-foreground">No appointments today.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {todayAppointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {format(toZonedTime(new Date(a.start_time), SALON_TIMEZONE), "hh:mm a")}{" "}
                      · {a.customer?.name ?? "—"} · {a.customer?.phone ?? ""}
                    </span>
                    <Badge variant="outline">{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="p-6 max-w-2xl mx-auto my-10 bg-destructive/10 border border-destructive text-destructive rounded-lg space-y-4">
        <h2 className="text-xl font-bold">Server-Side Exception Captured</h2>
        <p className="font-semibold text-sm">This diagnostic screen is displayed to assist in identifying issues in the live environment.</p>
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
