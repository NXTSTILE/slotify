import { Pool, QueryResult, QueryResultRow } from 'pg';

// ─── Serverless-safe connection pool ─────────────────────────────────────────
//
// Vercel runs each API route in an isolated serverless function (Node.js).
// A new Pool may be created on every cold-start. To prevent exhausting
// Supabase's connection limit (60 on free tier, 200 on Pro), we:
//   • Keep max connections LOW (3 per function instance in production).
//   • Set allowExitOnIdle:true so the Node process can exit once idle,
//     releasing the connection back to the Supabase Supavisor pool.
//   • Use shorter idle/connection timeouts so stale connections are freed fast.
//
// ⚠️  DATABASE_URL in production MUST point to Supabase Transaction Pooler
//     (port 6543, ?pgbouncer=true), NOT the direct connection (port 5432).
//     Using the direct connection with many concurrent Vercel functions will
//     exhaust the DB connection limit.
// ─────────────────────────────────────────────────────────────────────────────

let pool: Pool | null = null;

/**
 * Strips the `sslmode` query param from a connection string so that our
 * explicit `ssl` object is never overridden by the pg connection string
 * parser (pg v8+ treats `sslmode=require` as `verify-full`, which fails
 * against Supabase's self-signed cert).
 */
function stripSslMode(connectionString: string): string {
  return connectionString
    .replace(/[?&]sslmode=[^&]*/g, (match) => (match.startsWith('?') ? '?' : ''))
    .replace(/\?$/, '');
}

function getPool(): Pool {
  if (pool) return pool;

  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) {
    // Build-time or CI: return a dummy pool that will throw at query time.
    // This prevents Next.js static build from crashing when the DB URL is
    // intentionally absent during the build phase.
    console.warn('[db] ⚠️  Missing DATABASE_URL (expected during build only)');
    return new Pool({ connectionString: 'postgres://dummy:dummy@localhost:5432/dummy' });
  }

  const connectionString = stripSslMode(rawConnectionString);

  // Determine if SSL is needed (not needed for localhost/127.0.0.1).
  const isLocal =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const sslConfig = isLocal ? false : { rejectUnauthorized: false };

  if (process.env.NODE_ENV === 'production') {
    // ── Production (Vercel Serverless) ────────────────────────────────────
    // max:3    — safe for Supabase transaction pooler concurrency limits.
    // allowExitOnIdle:true — lets the Node process exit when idle so Vercel
    //            can reclaim the function and the DB connection is released.
    // idleTimeoutMillis:10_000 — release idle clients quickly (10 s).
    // connectionTimeoutMillis:5_000 — fail fast if the DB is unreachable.
    pool = new Pool({
      connectionString,
      ssl: sslConfig,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
  } else {
    // ── Development (next dev with hot-reload) ────────────────────────────
    // Cache the pool on `global` to survive hot-module-replacement without
    // leaking PostgreSQL sockets on every file save.
    const g = global as typeof globalThis & { _pgPool?: Pool };
    if (!g._pgPool) {
      g._pgPool = new Pool({
        connectionString,
        ssl: sslConfig,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
    }
    pool = g._pgPool;
  }

  // Surface pool-level errors so they appear in Vercel function logs.
  pool.on('error', (err) => {
    console.error('[db] Pool error (idle client):', err.message);
  });

  return pool;
}

// ─── Public query interface ───────────────────────────────────────────────────

export const db = {
  /**
   * Execute a parameterized PostgreSQL query safely.
   *
   * @param text   SQL query string with `$1`, `$2`, … placeholders.
   * @param params Query parameter values (prevents SQL injection).
   */
  query: async <T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> => {
    if (!process.env.DATABASE_URL) {
      throw new Error('[db] Missing DATABASE_URL at runtime — set it in Vercel Environment Variables');
    }

    const activePool = getPool();
    const start = Date.now();

    try {
      const res = await activePool.query<T>(text, params);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[db]', { query: text.slice(0, 80), duration: `${Date.now() - start}ms`, rows: res.rowCount });
      }
      return res;
    } catch (err: any) {
      // Always log query errors — they surface in Vercel function logs.
      console.error('[db] Query error:', { query: text.slice(0, 120), error: err.message });
      throw err;
    }
  },

  /** Expose the raw Pool for transactions (`client = await db.pool.connect()`). */
  get pool() {
    return getPool();
  },
};

export default db;
