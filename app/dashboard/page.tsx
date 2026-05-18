import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { SALON_TIMEZONE } from "@/lib/constants";
import { markNotificationsReadAction } from "@/app/actions/salon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WalkInButton } from "@/components/walk-in-button";

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { salon } = await getSalonForUser(supabase, user.id);
  if (!salon) {
    return null;
  }

  const start = new Date();
  const dayStart = format(toZonedTime(start, SALON_TIMEZONE), "yyyy-MM-dd");
  const zStart = `${dayStart}T00:00:00+05:30`;
  const zEnd = `${dayStart}T23:59:59+05:30`;

  const { data: aptRows, error: aptErr } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, total_price, customer_id")
    .eq("salon_id", salon.id)
    .gte("start_time", new Date(zStart).toISOString())
    .lte("start_time", new Date(zEnd).toISOString())
    .order("start_time", { ascending: true });

  if (aptErr) {
    console.error(aptErr.message);
  }

  const custIds = Array.from(new Set((aptRows ?? []).map((a) => a.customer_id)));
  const { data: custRows } =
    custIds.length > 0
      ? await supabase.from("customers").select("id, name, phone").in("id", custIds)
      : { data: [] as { id: string; name: string; phone: string }[] };
  const custById = new Map((custRows ?? []).map((c) => [c.id, c]));

  const todayAppointments = (aptRows ?? []).map((a) => ({
    ...a,
    customer: custById.get(a.customer_id),
  }));

  const { data: revenueRow } = await supabase
    .from("appointments")
    .select("total_price")
    .eq("salon_id", salon.id)
    .eq("status", "completed")
    .gte("start_time", new Date(zStart).toISOString())
    .lte("start_time", new Date(zEnd).toISOString());

  const revenue =
    revenueRow?.reduce((a, r) => a + Number(r.total_price), 0) ?? 0;

  const bookingsCount = todayAppointments?.length ?? 0;

  const upcoming =
    todayAppointments?.filter(
      (a) => a.status === "pending" || a.status === "confirmed"
    ) ?? [];
  const next = upcoming[0];

  const { count: unread } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("is_read", false);

  const { data: services } = await supabase
    .from("services")
    .select("id, name, price")
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

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
        <WalkInButton services={services ?? []} />
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
            {(unread ?? 0) > 0 && (
              <form action={markNotificationsReadAction}>
                <button type="submit" className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              </form>
            )}
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{unread ?? 0}</CardContent>
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
          {(todayAppointments ?? []).length === 0 ? (
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
}
