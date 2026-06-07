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
    // PART A: Process pending reschedule/cancellation notifications
    const pendingNotifsRes = await db.query(
      `SELECT n.id as notification_id, n.type as notification_type,
              a.id as appointment_id, a.start_time, a.status, a.cancellation_reason, a.created_at as appointment_created_at,
              c.phone as customer_phone, c.name as customer_name,
              s.id as salon_id, s.name as salon_name, s.whatsapp_phone_number_id, s.whatsapp_access_token,
              cs.updated_at as last_customer_message_at
       FROM public.notifications n
       JOIN public.appointments a ON a.id = n.appointment_id
       JOIN public.customers c ON c.id = a.customer_id
       JOIN public.salons s ON s.id = n.salon_id
       LEFT JOIN public.conversation_states cs ON cs.customer_phone = c.phone AND cs.salon_id = s.id
       WHERE n.type IN ('cancellation', 'reschedule') AND n.whatsapp_sent = false`
    );

    for (const notif of pendingNotifsRes.rows) {
      const pid = notif.whatsapp_phone_number_id;
      const tok = notif.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;
      const phone = notif.customer_phone;

      if (pid && tok && phone) {
        // Enforce 12-hour customer care window check
        const lastMsg = notif.last_customer_message_at 
          ? new Date(notif.last_customer_message_at) 
          : new Date(notif.appointment_created_at);
        const diffHours = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);

        if (diffHours <= 12) {
          const { sendWhatsAppText } = await import("@/lib/whatsapp/send");
          let bodyText = "";
          if (notif.notification_type === "cancellation") {
            bodyText = `We're sorry, your appointment at *${notif.salon_name}* has been cancelled by the salon.`;
            if (notif.cancellation_reason && notif.cancellation_reason.trim()) {
              bodyText += `\nReason: ${notif.cancellation_reason.trim()}`;
            }
            bodyText += `\n\nSend *hi* to rebook at another time.`;
          } else if (notif.notification_type === "reschedule") {
            bodyText = `Your appointment at *${notif.salon_name}* has been rescheduled to a different queue. Send *hi* to see your updated details.`;
          }

          if (bodyText) {
            try {
              const res = await sendWhatsAppText(pid, tok, { toE164: phone, body: bodyText });
              if (!res.ok) {
                console.error("[cron/reminders] Failed to send notification:", res.error);
              }
            } catch (err: any) {
              console.error("[cron/reminders] Error sending notification:", err.message);
            }
          }
        } else {
          console.warn(`[cron/reminders] Skipping notification ${notif.notification_id} - customer last messaged ${diffHours.toFixed(1)} hours ago (exceeds 12h window)`);
        }
      }

      // Mark notification as sent so we don't try again
      await db.query(
        "UPDATE public.notifications SET whatsapp_sent = true WHERE id = $1",
        [notif.notification_id]
      );
    }

    // PART B: Fetch pending confirmed appointments meeting either condition for reminders
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
