import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Force dynamic rendering — this endpoint queries live DB data.
export const dynamic = 'force-dynamic';

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Secured with the same CRON_SECRET used by the reminder cron.
// Call with:  GET /api/debug-db
//             Authorization: Bearer <CRON_SECRET>
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

/** Mask the password portion of a PostgreSQL connection string. */
function maskConnectionString(url: string): string {
  return url.replace(/:([^:@]+)@/, ':****@');
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      maskedDatabaseUrl: process.env.DATABASE_URL
        ? maskConnectionString(process.env.DATABASE_URL)
        : null,
    },
  };

  try {
    // 1. Basic connectivity check
    const timeRes = await db.query<{ now: string }>('SELECT NOW() as now');
    diagnostics.connection = { ok: true, serverTime: timeRes.rows[0].now };

    // 2. List public tables (schema only — no row data)
    const tablesRes = await db.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    diagnostics.schema = { tables: tablesRes.rows.map((r) => r.table_name) };

    // 3. Row counts per table (safe — no PII returned)
    const countQueries = diagnostics.schema.tables.map((t: string) =>
      db
        .query<{ count: string }>(`SELECT COUNT(*)::text as count FROM public.${t}`)
        .then((r) => ({ table: t, count: r.rows[0]?.count ?? '0' }))
        .catch(() => ({ table: t, count: 'error' }))
    );
    diagnostics.rowCounts = await Promise.all(countQueries);

    // 4. Recent webhook errors (last 5) — IDs only, no payload data
    const webhookRes = await db.query<{ id: string; error: string; received_at: string }>(`
      SELECT id, error, received_at
      FROM public.webhook_logs
      WHERE error IS NOT NULL
      ORDER BY received_at DESC
      LIMIT 5
    `);
    diagnostics.recentWebhookErrors = webhookRes.rows;

    // 5. Salon WhatsApp config status (no tokens — only presence check)
    const salonsRes = await db.query<{
      id: string;
      name: string;
      has_phone_id: boolean;
      has_token: boolean;
    }>(`
      SELECT
        id,
        name,
        (whatsapp_phone_number_id IS NOT NULL AND whatsapp_phone_number_id != '') AS has_phone_id,
        (whatsapp_access_token IS NOT NULL AND whatsapp_access_token != '') AS has_token
      FROM public.salons
      WHERE is_deleted = false
      ORDER BY name
    `);
    diagnostics.salons = salonsRes.rows;

    return NextResponse.json({ ok: true, diagnostics }, { status: 200 });
  } catch (err: any) {
    diagnostics.connection = { ok: false, error: err.message };
    console.error('[debug-db] Diagnostic query failed:', err.message);
    return NextResponse.json({ ok: false, error: err.message, diagnostics }, { status: 500 });
  }
}
