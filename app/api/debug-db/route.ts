import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  const rawConnectionString = process.env.DATABASE_URL || "";
  if (rawConnectionString) {
    const masked = rawConnectionString.replace(/:[^:@]+@/, ':****@');
    diagnostics.env.maskedDatabaseUrl = masked;
  }

  try {
    // 1. Connection test
    const timeRes = await db.query("SELECT NOW() as now");
    diagnostics.connection = {
      ok: true,
      time: timeRes.rows[0].now,
    };

    // 2. Fetch schema tables
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    diagnostics.schema = {
      tables: tablesRes.rows.map((r: any) => r.table_name),
    };

    // 3. Test query on users table
    try {
      const usersRes = await db.query("SELECT id, email FROM public.users");
      diagnostics.usersTable = {
        ok: true,
        count: usersRes.rowCount,
        users: usersRes.rows,
      };
    } catch (e: any) {
      diagnostics.usersTable = {
        ok: false,
        error: e.message,
      };
    }

    // 4. Test query on salons table
    try {
      const salonsRes = await db.query("SELECT id, name, whatsapp_phone_number_id, whatsapp_business_account_id, (whatsapp_access_token IS NOT NULL) as has_token FROM public.salons WHERE is_deleted = false");
      diagnostics.salonsTable = {
        ok: true,
        count: salonsRes.rowCount,
        salons: salonsRes.rows,
      };
    } catch (e: any) {
      diagnostics.salonsTable = {
        ok: false,
        error: e.message,
      };
    }

    try {
      const webhookLogsRes = await db.query(
        "SELECT id, error, created_at FROM public.webhook_logs WHERE error IS NOT NULL ORDER BY created_at DESC LIMIT 5"
      );
      diagnostics.webhookLogs = webhookLogsRes.rows;
    } catch (e: any) {
      diagnostics.webhookLogs = { ok: false, error: e.message };
    }

    return NextResponse.json({ ok: true, diagnostics });
  } catch (err: any) {
    diagnostics.connection = {
      ok: false,
      error: err.message,
      stack: err.stack,
    };
    return NextResponse.json({ ok: false, error: err.message, diagnostics }, { status: 500 });
  }
}
