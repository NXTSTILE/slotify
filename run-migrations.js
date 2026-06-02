/**
 * Automatic Database Migrations Runner
 * Reads files from supabase/migrations/ and runs them in order.
 * Keeps track of applied migrations in a _migrations table.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const rawConnectionString = process.env.DATABASE_URL;

  if (!rawConnectionString) {
    console.log('[Migration] No DATABASE_URL found. Skipping migrations.');
    return;
  }

  // Strip sslmode from the URL to let our explicit ssl config take action
  const connectionString = rawConnectionString.replace(/[?&]sslmode=[^&]*/g, (match) => {
    const isQuery = match.startsWith('?');
    return isQuery ? '?' : '';
  }).replace(/\?$/, '');

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  let client;
  try {
    client = await pool.connect();
    console.log('[Migration] Checking database schema...');

    // 1. Create tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Read migration directory
    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migration] Migrations directory not found at:', migrationsDir);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run chronologically

    // 3. Get applied migrations
    const { rows } = await client.query('SELECT name FROM public._migrations');
    const applied = new Set(rows.map(r => r.name));

    // 4. Run pending migrations
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      console.log(`[Migration] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Run migration within a transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migration] Completed ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('[Migration] Database is fully up-to-date!');
  } catch (err) {
    console.error('[Migration] Failed to run database migrations:', err);
    console.log('[Migration] Continuing application startup despite migration failure.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Support both direct execution and module import
if (require.main === module) {
  run();
}

module.exports = run;
