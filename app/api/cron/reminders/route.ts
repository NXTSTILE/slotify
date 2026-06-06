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
  
  // CONDITION 1: Long-term booking
  // We want to send a reminder ~23.5 hours AFTER the customer started the chat (i.e. booked the appointment)
  // This ensures the reminder is sent just before the WhatsApp 24-hour free messaging window closes.
  const longTermCreatedStart = addHours(now, -24.5);
  const longTermCreatedEnd = addHours(now, -23.5);

  // CONDITION 2: Short-term booking
  // If the appointment is booked within 24 hours of the current time, we send a reminder exactly 1 hour before it starts.
  // We ensure it was booked within the last 24 hours to stay compliant.
  const shortTermCreatedMin = addHours(now, -24);
  const shortTermStartMin = addHours(now, 0.5);
  const shortTermStartMax = addHours(now, 1.5);

  try {
    // Fetch pending confirmed appointments meeting either condition
    const aptRes = await db.query(
      `SELECT id, salon_id, start_time, customer_id, reminder_sent 
       FROM public.appointments 
       WHERE status = 'confirmed' AND is_deleted = false AND reminder_sent = false 
       AND (
         (created_at >= $1 AND created_at <= $2)
         OR 
         (created_at >= $3 AND start_time >= $4 AND start_time <= $5)
       )`,
      [
        longTermCreatedStart.toISOString(), 
        longTermCreatedEnd.toISOString(),
        shortTermCreatedMin.toISOString(),
        shortTermStartMin.toISOString(),
        shortTermStartMax.toISOString()
      ]
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
       FROM public.salons WHERE id = ANY($1::uuid[]) AND is_deleted = false`,
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
