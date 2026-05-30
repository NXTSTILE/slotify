import { Pool, QueryResult, QueryResultRow } from 'pg';

let pool: Pool;

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error("Missing DATABASE_URL environment variable");
}

// Strip sslmode from the URL so our explicit ssl object is never overridden
// by the connection string parser (pg v8+ treats sslmode=require as verify-full)
const connectionString = rawConnectionString.replace(/[?&]sslmode=[^&]*/g, (match) => {
  const isQuery = match.startsWith('?');
  return isQuery ? '?' : '';
}).replace(/\?$/, '');

if (process.env.NODE_ENV === 'production') {
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else {
  // Next.js hot-reload creates new pools on every refresh in development.
  // Caching the pool globally prevents PostgreSQL socket leakages.
  const globalWithPg = global as typeof globalThis & {
    pgPool?: Pool;
  };
  if (!globalWithPg.pgPool) {
    globalWithPg.pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  pool = globalWithPg.pgPool;
}

export const db = {
  /**
   * Run a parameterized PostgreSQL query safely against the active connection pool.
   */
  query: async <T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> => {
    const start = Date.now();
    try {
      const res = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Database Query Executed]', { text, duration: `${duration}ms`, rows: res.rowCount });
      }
      return res;
    } catch (err: any) {
      console.error('[Database Query Error]', { text, error: err.message });
      throw err;
    }
  },
  pool,
};
export default db;
