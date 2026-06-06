import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  // 1. Fetch active session context
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Load salon details
  const salonRes = await db.query(
    "SELECT * FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // 3. Load working hours list
  const whRes = await db.query(
    "SELECT day_of_week, open_time, close_time, is_closed FROM public.working_hours WHERE salon_id = $1",
    [salon.id]
  );
  const whRows = whRes.rows;

  // 4. Load holidays list
  const holRes = await db.query(
    "SELECT id, date, reason FROM public.holidays WHERE salon_id = $1 ORDER BY date ASC",
    [salon.id]
  );
  
  // Format Date objects to serialized yyyy-MM-dd strings to prevent Next.js client component serialization crashes
  const holidays = holRes.rows.map((h) => ({
    id: h.id,
    date: h.date instanceof Date ? h.date.toISOString().split("T")[0] : String(h.date).split("T")[0],
    reason: h.reason,
  }));

  return (
    <SettingsView
      salon={{
        name: salon.name,
        phone: salon.phone,
        address: salon.address,
        city: salon.city,
        cancellation_policy: salon.cancellation_policy,
        services_display_mode: salon.services_display_mode,
        whatsapp_phone_number_id: salon.whatsapp_phone_number_id,
        whatsapp_access_token: salon.whatsapp_access_token,
        whatsapp_business_account_id: salon.whatsapp_business_account_id,
      }}
      workingHours={whRows}
      holidays={holidays}
    />
  );
}
