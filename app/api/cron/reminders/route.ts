import { NextResponse } from "next/server";
import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // 1. Authorize the scheduler request
  const secret = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const windowStart = addHours(now, 23.5);
  const windowEnd = addHours(now, 24.5);

  try {
    // 2. Fetch pending confirmed appointments inside the 24-hour reminder window
    const aptRes = await db.query(
      `SELECT id, salon_id, start_time, customer_id, reminder_sent 
       FROM public.appointments 
       WHERE status = 'confirmed' AND reminder_sent = false 
       AND start_time >= $1 AND start_time <= $2`,
      [windowStart.toISOString(), windowEnd.toISOString()]
    );
    const appointments = aptRes.rows;

    if (appointments.length === 0) {
      return NextResponse.json({ ok: true, matched: 0, reminders_sent: 0 });
    }

    const customerIds = Array.from(new Set(appointments.map((a) => a.customer_id)));
    const salonIds = Array.from(new Set(appointments.map((a) => a.salon_id)));

    // 3. Fetch customers in bulk
    const custRes = await db.query(
      "SELECT id, phone FROM public.customers WHERE id = ANY($1::uuid[])",
      [customerIds]
    );
    const phoneByCustomer = new Map(custRes.rows.map((c) => [c.id, c.phone]));

    // 4. Fetch salons in bulk (including Meta Graph API credentials)
    const salonRes = await db.query(
      `SELECT id, name, whatsapp_phone_number_id, whatsapp_access_token 
       FROM public.salons WHERE id = ANY($1::uuid[])`,
      [salonIds]
    );
    const salonMap = new Map(salonRes.rows.map((s) => [s.id, s]));

    let sent = 0;
    
    // 5. Loop and trigger WhatsApp approved Templates
    for (const row of appointments) {
      const phone = phoneByCustomer.get(row.customer_id);
      const salon = salonMap.get(row.salon_id);
      
      if (!phone || !salon) continue;

      const pid = salon.whatsapp_phone_number_id;
      const tok = salon.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;
      if (!pid || !tok) {
        console.warn("[cron/reminders] Missing WhatsApp credentials for salon", salon.id);
        continue;
      }

      const start = new Date(row.start_time).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });

      // Send the approved Meta Template directly
      const result = await sendWhatsAppTemplate(
        pid,
        tok,
        phone,
        "appointment_reminder",
        "en",
        [salon.name, start]
      );

      if (!result.ok) {
        console.error("[cron/reminders] Send WhatsApp Template failed for appointment", row.id, result.error);
        continue;
      }

      // 6. Update reminder status in PostgreSQL
      const updateRes = await db.query(
        "UPDATE public.appointments SET reminder_sent = true WHERE id = $1 AND reminder_sent = false RETURNING id",
        [row.id]
      );

      if (updateRes.rows.length > 0) {
        sent += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      matched: appointments.length,
      reminders_sent: sent,
    });

  } catch (err: any) {
    console.error("[cron/reminders] database execution failure", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
