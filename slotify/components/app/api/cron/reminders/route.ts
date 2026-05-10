import { NextResponse } from "next/server";
import { addHours } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendForSalon, sendWhatsAppTemplate } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createServiceRoleClient();
  const now = new Date();
  const windowStart = addHours(now, 23.5);
  const windowEnd = addHours(now, 24.5);

  const { data: appointments, error } = await admin
    .from("appointments")
    .select("id, salon_id, start_time, customer_id, reminder_sent")
    .eq("status", "confirmed")
    .eq("reminder_sent", false)
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString());

  if (error) {
    console.error("[cron/reminders]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = appointments ?? [];
  const customerIds = Array.from(new Set(list.map((a) => a.customer_id)));
  const salonIds = Array.from(new Set(list.map((a) => a.salon_id)));

  const { data: customers } =
    customerIds.length > 0
      ? await admin.from("customers").select("id, phone").in("id", customerIds)
      : { data: [] as { id: string; phone: string }[] };

  const { data: salons } =
    salonIds.length > 0
      ? await admin.from("salons").select("id, name").in("id", salonIds)
      : { data: [] as { id: string; name: string }[] };

  const phoneByCustomer = new Map((customers ?? []).map((c) => [c.id, c.phone]));
  const nameBySalon = new Map((salons ?? []).map((s) => [s.id, s.name]));

  let sent = 0;
  for (const row of list) {
    const phone = phoneByCustomer.get(row.customer_id);
    if (!phone) continue;

    const salonName = nameBySalon.get(row.salon_id) ?? "Salon";

    const start = new Date(row.start_time).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const result = await sendForSalon(admin, row.salon_id, (pid, tok) =>
      sendWhatsAppTemplate(pid, tok, phone, "appointment_reminder", "en", [
        salonName,
        start,
      ])
    );

    if (!result.ok) {
      console.error("[cron/reminders] send failed", row.id, result.error);
      continue;
    }

    const { error: upErr, data: updated } = await admin
      .from("appointments")
      .update({ reminder_sent: true })
      .eq("id", row.id)
      .eq("reminder_sent", false)
      .select("id")
      .maybeSingle();

    if (upErr) {
      console.error("[cron/reminders] update failed", row.id, upErr.message);
      continue;
    }
    if (!updated) {
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    matched: list.length,
    reminders_sent: sent,
  });
}
