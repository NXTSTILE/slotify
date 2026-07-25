import { NextResponse } from 'next/server';
import { addHours } from 'date-fns';
import { db } from '@/lib/db';
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/whatsapp/send';

// Force dynamic — never cache cron responses.
export const dynamic = 'force-dynamic';

// Node.js runtime — uses pg (not available in Edge Runtime).
export const runtime = 'nodejs';

// Vercel Pro: max function duration in seconds (up to 300 on Pro plan).
// Set to 60 s — gives plenty of headroom for bulk WhatsApp sends.
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingNotification {
  notification_id: string;
  notification_type: 'cancellation' | 'reschedule';
  appointment_id: string;
  start_time: string;
  status: string;
  cancellation_reason: string | null;
  appointment_created_at: string;
  customer_phone: string;
  customer_name: string;
  salon_id: string;
  salon_name: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  last_customer_message_at: string | null;
}

interface PendingAppointment {
  id: string;
  salon_id: string;
  start_time: string;
  customer_id: string;
  reminder_sent: boolean;
}

interface CustomerRow {
  id: string;
  phone: string;
}

interface SalonRow {
  id: string;
  name: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Vercel Cron automatically passes `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set in environment variables.
// Manual test:  GET /api/cron/reminders
//               Authorization: Bearer <your_CRON_SECRET>
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/reminders] CRON_SECRET env var is not set');
    return false;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  console.log('[cron/reminders] Starting run at', now.toISOString());

  // ── Time windows ────────────────────────────────────────────────────────────
  // CONDITION 1 — Long-term booking (booked >24 h ahead)
  // Send reminder 23.5–24.5 hours after booking so the WhatsApp 24-hour
  // customer-care window is still open when the reminder lands.
  const longTermCreatedStart = addHours(now, -24.5);
  const longTermCreatedEnd = addHours(now, -23.5);

  // CONDITION 2 — Short-term booking (booked within 24 h of appointment)
  // Send reminder 30–90 min before the appointment start.
  const shortTermCreatedMin = addHours(now, -24);
  const shortTermStartMin = addHours(now, 0.5);
  const shortTermStartMax = addHours(now, 1.5);

  try {
    // ── Part A: Flush pending cancellation / reschedule notifications ────────
    const pendingNotifsRes = await db.query<PendingNotification>(`
      SELECT
        n.id                        AS notification_id,
        n.type                      AS notification_type,
        a.id                        AS appointment_id,
        a.start_time,
        a.status,
        a.cancellation_reason,
        a.created_at                AS appointment_created_at,
        c.phone                     AS customer_phone,
        c.name                      AS customer_name,
        s.id                        AS salon_id,
        s.name                      AS salon_name,
        s.whatsapp_phone_number_id,
        s.whatsapp_access_token,
        cs.updated_at               AS last_customer_message_at
      FROM public.notifications n
      JOIN public.appointments       a  ON a.id       = n.appointment_id
      JOIN public.customers          c  ON c.id       = a.customer_id
      JOIN public.salons             s  ON s.id       = n.salon_id
      LEFT JOIN public.conversation_states cs
        ON cs.customer_phone = c.phone AND cs.salon_id = s.id
      WHERE n.type IN ('cancellation', 'reschedule')
        AND n.whatsapp_sent = false
    `);

    console.log(`[cron/reminders] Pending notifications: ${pendingNotifsRes.rowCount}`);

    // Process all pending notifications concurrently for speed.
    const notifResults = await Promise.allSettled(
      pendingNotifsRes.rows.map(async (notif) => {
        const pid = notif.whatsapp_phone_number_id;
        const tok = notif.whatsapp_access_token;
        const phone = notif.customer_phone;

        // Always mark as sent (even if we can't deliver) to prevent re-queuing.
        const markSent = () =>
          db
            .query('UPDATE public.notifications SET whatsapp_sent = true WHERE id = $1', [
              notif.notification_id,
            ])
            .catch((e) =>
              console.error('[cron/reminders] Failed to mark notification sent:', e.message)
            );

        if (!pid || !tok || !phone) {
          console.warn(
            `[cron/reminders] Skipping notification ${notif.notification_id} — missing WhatsApp credentials`
          );
          await markSent();
          return;
        }

        // Enforce Meta's 24-hour customer care messaging window.
        const lastMsg = notif.last_customer_message_at
          ? new Date(notif.last_customer_message_at)
          : new Date(notif.appointment_created_at);
        const diffHours = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);

        if (diffHours > 24) {
          console.warn(
            `[cron/reminders] Skipping notification ${notif.notification_id} — customer last messaged ${diffHours.toFixed(1)} h ago (exceeds 24 h window)`
          );
          await markSent();
          return;
        }

        let bodyText = '';
        if (notif.notification_type === 'cancellation') {
          bodyText = `We're sorry, your appointment at *${notif.salon_name}* has been cancelled by the salon.`;
          if (notif.cancellation_reason?.trim()) {
            bodyText += `\nReason: ${notif.cancellation_reason.trim()}`;
          }
          bodyText += `\n\nSend *hi* to rebook at another time.`;
        } else if (notif.notification_type === 'reschedule') {
          bodyText = `Your appointment at *${notif.salon_name}* has been rescheduled to a different queue. Send *hi* to see your updated details.`;
        }

        if (!bodyText) {
          await markSent();
          return;
        }

        const res = await sendWhatsAppText(pid, tok, { toE164: phone, body: bodyText });
        if (!res.ok) {
          console.error(
            `[cron/reminders] Failed to send ${notif.notification_type} notification ${notif.notification_id}:`,
            res.error
          );
        }
        await markSent();
      })
    );

    // Log any unexpected Promise rejections from Part A.
    notifResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[cron/reminders] Notification[${i}] threw:`, r.reason);
      }
    });

    // ── Part B: Appointment reminder messages ────────────────────────────────
    const aptRes = await db.query<PendingAppointment>(`
      SELECT id, salon_id, start_time, customer_id, reminder_sent
      FROM public.appointments
      WHERE status = 'confirmed'
        AND is_deleted = false
        AND reminder_sent = false
        AND (
          -- Long-term: booked ~24 h ago
          (created_at >= $1 AND created_at <= $2)
          OR
          -- Short-term: booked recently, appointment in ~1 h
          (created_at >= $3 AND start_time >= $4 AND start_time <= $5)
        )
    `, [
      longTermCreatedStart.toISOString(),
      longTermCreatedEnd.toISOString(),
      shortTermCreatedMin.toISOString(),
      shortTermStartMin.toISOString(),
      shortTermStartMax.toISOString(),
    ]);

    console.log(`[cron/reminders] Appointments matching reminder window: ${aptRes.rowCount}`);

    if (aptRes.rowCount === 0) {
      return NextResponse.json({ ok: true, matched: 0, reminders_sent: 0 });
    }

    const appointments = aptRes.rows;
    const customerIds = Array.from(new Set(appointments.map((a) => a.customer_id)));
    const salonIds = Array.from(new Set(appointments.map((a) => a.salon_id)));

    // Bulk-fetch customers and salons in 2 parallel queries.
    const [custRes, salonRes] = await Promise.all([
      db.query<CustomerRow>(
        'SELECT id, phone FROM public.customers WHERE id = ANY($1::uuid[])',
        [customerIds]
      ),
      db.query<SalonRow>(
        `SELECT id, name, whatsapp_phone_number_id, whatsapp_access_token
         FROM public.salons
         WHERE id = ANY($1::uuid[]) AND is_deleted = false`,
        [salonIds]
      ),
    ]);

    const phoneByCustomer = new Map(custRes.rows.map((c) => [c.id, c.phone]));
    const salonMap = new Map(salonRes.rows.map((s) => [s.id, s]));

    // Send all reminders concurrently (Promise.allSettled — one failure
    // doesn't block others).
    let sent = 0;
    const reminderResults = await Promise.allSettled(
      appointments.map(async (row) => {
        const phone = phoneByCustomer.get(row.customer_id);
        const salon = salonMap.get(row.salon_id);
        if (!phone || !salon) return;

        const pid = salon.whatsapp_phone_number_id;
        const tok = salon.whatsapp_access_token;
        if (!pid || !tok) {
          console.warn(`[cron/reminders] Missing WhatsApp credentials for salon ${salon.id}`);
          return;
        }

        const formattedStart = new Date(row.start_time).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        const result = await sendWhatsAppTemplate(pid, tok, phone, 'appointment_reminder', 'en', [
          salon.name,
          formattedStart,
        ]);

        if (!result.ok) {
          console.error(
            `[cron/reminders] Template send failed for appointment ${row.id}:`,
            result.error
          );
          return;
        }

        // Atomic update — only increment counter if the row was actually
        // changed (guards against duplicate concurrent cron invocations).
        const updateRes = await db.query<{ id: string }>(
          'UPDATE public.appointments SET reminder_sent = true WHERE id = $1 AND reminder_sent = false RETURNING id',
          [row.id]
        );
        if (updateRes.rowCount && updateRes.rowCount > 0) {
          sent += 1;
        }
      })
    );

    // Log any unexpected rejections from Part B.
    reminderResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[cron/reminders] Reminder[${i}] threw:`, r.reason);
      }
    });

    console.log(`[cron/reminders] Done — matched: ${appointments.length}, sent: ${sent}`);

    return NextResponse.json({
      ok: true,
      matched: appointments.length,
      reminders_sent: sent,
    });
  } catch (err: any) {
    console.error('[cron/reminders] Fatal error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
