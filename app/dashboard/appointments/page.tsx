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
    `SELECT id, start_time, end_time, status, total_price, total_duration_minutes, customer_id, queue_id 
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

  // 5. Query appointment service relations joining subservices
  const aptIdList = aptRows.map((a) => a.id);
  let lines: any[] = [];
  if (aptIdList.length > 0) {
    const linesRes = await db.query(
      `SELECT aps.appointment_id, s.name 
       FROM public.appointment_services aps 
       JOIN public.subservices s ON aps.service_id = s.id 
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

  // 7. Bulk-fetch queue names
  const queueIds = Array.from(
    new Set(aptRows.map((a) => a.queue_id).filter(Boolean))
  );
  let queueRows: any[] = [];
  if (queueIds.length > 0) {
    const queueRes = await db.query(
      "SELECT id, name FROM public.queues WHERE id = ANY($1::uuid[])",
      [queueIds]
    );
    queueRows = queueRes.rows;
  }
  const queueMap = new Map(queueRows.map((q) => [q.id, q.name as string]));

  // 7b. Fetch all active queues for rescheduling selection
  const activeQueuesRes = await db.query(
    "SELECT id, name FROM public.queues WHERE salon_id = $1 AND is_active = true ORDER BY name ASC",
    [salon.id]
  );
  const activeQueues = activeQueuesRes.rows;

  // 8. Format initial appointments array structure
  const initial = aptRows.map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    total_price: a.total_price,
    total_duration_minutes: a.total_duration_minutes,
    customers: custMap.get(a.customer_id) ?? { name: "", phone: "" },
    queue_id: a.queue_id,
    queue_name: a.queue_id ? (queueMap.get(a.queue_id) ?? null) : null,
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
      <AppointmentsView initial={initial} salonName={salon.name} activeQueues={activeQueues} />
    </div>
  );
}
