import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Force dynamic rendering — queries live DB data.
export const dynamic = 'force-dynamic';

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Secured with CRON_SECRET (same as cron endpoint).
// Call with:  GET /api/full-diag
//             Authorization: Bearer <CRON_SECRET>
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [
      users,
      salons,
      services,
      workingHours,
      customers,
      appointments,
      conversationStates,
      webhookLogs,
    ] = await Promise.all([
      db.query(`
        SELECT id, email, is_super_admin, created_at
        FROM public.users
        ORDER BY created_at
      `),
      db.query(`
        SELECT
          id, name, phone, owner_id,
          whatsapp_phone_number_id,
          whatsapp_business_account_id,
          (whatsapp_access_token IS NOT NULL AND whatsapp_access_token != '') AS has_token
        FROM public.salons
        WHERE is_deleted = false
      `),
      db.query(`
        SELECT id, salon_id, name, price, duration_minutes, is_active
        FROM public.services
        ORDER BY salon_id
      `),
      db.query(`
        SELECT salon_id, day_of_week, open_time, close_time, is_closed
        FROM public.working_hours
        ORDER BY salon_id, day_of_week
      `),
      db.query(`
        SELECT id, salon_id, phone, name
        FROM public.customers
        ORDER BY created_at DESC
        LIMIT 10
      `),
      db.query(`
        SELECT id, salon_id, status, start_time, total_price
        FROM public.appointments
        ORDER BY created_at DESC
        LIMIT 10
      `),
      db.query(`
        SELECT salon_id, customer_phone, state, updated_at
        FROM public.conversation_states
        ORDER BY updated_at DESC
        LIMIT 10
      `),
      db.query(`
        SELECT id, received_at, headers, body, error
        FROM public.webhook_logs
        ORDER BY received_at DESC
        LIMIT 15
      `),
    ]);

    return NextResponse.json(
      {
        users: users.rows,
        salons: salons.rows,
        services: services.rows,
        workingHours: workingHours.rows,
        recentCustomers: customers.rows,
        recentAppointments: appointments.rows,
        conversationStates: conversationStates.rows,
        webhookLogs: webhookLogs.rows,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[full-diag] Failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
