import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { SALON_TIMEZONE } from "@/lib/constants";
import { AppointmentsView } from "./appointments-view";

export default async function AppointmentsPage() {
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

  const { data: aptRows, error: aptErr } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, total_price, total_duration_minutes, customer_id")
    .eq("salon_id", salon.id)
    .order("start_time", { ascending: true });

  if (aptErr) {
    console.error(aptErr.message);
  }

  const ids = Array.from(new Set((aptRows ?? []).map((a) => a.customer_id)));
  const { data: custs } =
    ids.length > 0
      ? await supabase.from("customers").select("id, name, phone").in("id", ids)
      : { data: [] as { id: string; name: string; phone: string }[] };
  const custMap = new Map((custs ?? []).map((c) => [c.id, c]));

  const aptIdList = (aptRows ?? []).map((a) => a.id);
  const { data: lines } =
    aptIdList.length > 0
      ? await supabase
          .from("appointment_services")
          .select("appointment_id, services(name)")
          .in("appointment_id", aptIdList)
      : { data: [] as { appointment_id: string; services: unknown }[] };

  const servicesByApt = new Map<string, string[]>();
  for (const l of lines ?? []) {
    const n =
      l.services && typeof l.services === "object" && "name" in l.services
        ? String((l.services as { name: string }).name)
        : "Service";
    const list = servicesByApt.get(l.appointment_id) ?? [];
    list.push(n);
    servicesByApt.set(l.appointment_id, list);
  }

  const initial = (aptRows ?? []).map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    total_price: a.total_price,
    total_duration_minutes: a.total_duration_minutes,
    customers: custMap.get(a.customer_id) ?? { name: "", phone: "" },
    appointment_services: (servicesByApt.get(a.id) ?? []).map((name) => ({
      service_id: "",
      services: { name },
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
        <p className="text-sm text-muted-foreground">Week + day view in {SALON_TIMEZONE}</p>
      </div>
      <AppointmentsView initial={initial} salonName={salon.name} />
    </div>
  );
}
