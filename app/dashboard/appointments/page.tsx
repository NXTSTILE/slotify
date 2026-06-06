import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SALON_TIMEZONE } from "@/lib/constants";
import { AppointmentsView } from "./appointments-view";

export default async function AppointmentsPage() {
  // 1. Fetch user session
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Load salon details
  const salonRes = await db.query(
    "SELECT id, name FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // 3. Load all appointments for the salon
  const aptRes = await db.query(
    `SELECT id, start_time, end_time, status, total_price, total_duration_minutes, customer_id, staff_id 
     FROM public.appointments 
     WHERE salon_id = $1 AND is_deleted = false
     ORDER BY start_time ASC`,
    [salon.id]
  );
  const aptRows = aptRes.rows;

  // 4. Load customers in bulk using SQL arrays
  const ids = Array.from(new Set(aptRows.map((a) => a.customer_id)));
  let custs: any[] = [];
  if (ids.length > 0) {
    const custRes = await db.query(
      "SELECT id, name, phone FROM public.customers WHERE id = ANY($1::uuid[])",
      [ids]
    );
    custs = custRes.rows;
  }
  const custMap = new Map(custs.map((c) => [c.id, c]));

  // 5. Query appointment service relations using a highly efficient standard SQL JOIN
  const aptIdList = aptRows.map((a) => a.id);
  let lines: any[] = [];
  if (aptIdList.length > 0) {
    const linesRes = await db.query(
      `SELECT aps.appointment_id, s.name 
       FROM public.appointment_services aps 
       JOIN public.services s ON aps.service_id = s.id 
       WHERE aps.appointment_id = ANY($1::uuid[])`,
      [aptIdList]
    );
    lines = linesRes.rows;
  }

  const servicesByApt = new Map<string, string[]>();
  for (const l of lines) {
    const list = servicesByApt.get(l.appointment_id) ?? [];
    list.push(l.name);
    servicesByApt.set(l.appointment_id, list);
  }

  // 7. Bulk-fetch staff names
  const staffIds = Array.from(
    new Set(aptRows.map((a) => a.staff_id).filter(Boolean))
  );
  let staffRows: any[] = [];
  if (staffIds.length > 0) {
    const staffRes = await db.query(
      "SELECT id, name FROM public.staff WHERE id = ANY($1::uuid[])",
      [staffIds]
    );
    staffRows = staffRes.rows;
  }
  const staffMap = new Map(staffRows.map((s) => [s.id, s.name as string]));

  // 8. Format initial appointments array structure for week-day rendering
  const initial = aptRows.map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    total_price: a.total_price,
    total_duration_minutes: a.total_duration_minutes,
    customers: custMap.get(a.customer_id) ?? { name: "", phone: "" },
    staff_name: a.staff_id ? (staffMap.get(a.staff_id) ?? null) : null,
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
