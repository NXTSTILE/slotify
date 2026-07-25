#!/usr/bin/env node

/**
 * run-migrations-prod.js
 *
 * One-time production migration runner for Vercel deployments.
 * Run this ONCE against the production database before going live,
 * or after adding new migration files.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/run-migrations-prod.js
 *   DATABASE_URL="postgresql://..." node scripts/run-migrations-prod.js --dry-run
 *
 * Requirements:
 *   npm install pg  (already in package.json)
 *
 * ⚠️  Use the DIRECT connection URL (port 5432), NOT the transaction pooler
 *     (port 6543), for running migrations — DDL statements require a dedicated
 *     connection and do not work correctly through PgBouncer in transaction mode.
 */

'use strict';

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[migrations] ${msg}\n`);
}

function error(msg) {
  process.stderr.write(`[migrations] ❌ ${msg}\n`);
}

function stripSslMode(connectionString) {
  return connectionString
    .replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith('?') ? '?' : ''))
    .replace(/\?$/, '');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runMigrations() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    error('DATABASE_URL environment variable is not set.');
    error('Usage: DATABASE_URL="postgresql://..." node scripts/run-migrations-prod.js');
    process.exit(1);
  }

  const connectionString = stripSslMode(rawUrl);
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  log(`Connecting to database… (SSL: ${isLocal ? 'off' : 'on'})`);
  if (DRY_RUN) log('🔍 DRY RUN mode — no SQL will be executed');

  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    log('✅ Connected');

    // Create migrations tracking table if it doesn't exist.
    if (!DRY_RUN) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public._migrations (
          id          serial PRIMARY KEY,
          filename    text NOT NULL UNIQUE,
          applied_at  timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    // Load already-applied migrations.
    const appliedRes = DRY_RUN
      ? { rows: [] }
      : await client.query('SELECT filename FROM public._migrations ORDER BY id');
    const applied = new Set(appliedRes.rows.map((r) => r.filename));

    // Read and sort migration files by filename (timestamps ensure order).
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      log('No migration files found in supabase/migrations/');
      return;
    }

    log(`Found ${files.length} migration file(s)`);
    let ran = 0;
    let skipped = 0;

    for (const filename of files) {
      if (applied.has(filename)) {
        log(`  ⏭  Skipping (already applied): ${filename}`);
        skipped += 1;
        continue;
      }

      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, 'utf8');

      log(`  ▶  Applying: ${filename}`);
      if (DRY_RUN) {
        log(`     [DRY RUN] Would execute ${sql.length} bytes of SQL`);
        ran += 1;
        continue;
      }

      // Run each migration in its own transaction so a failure
      // rolls back cleanly and doesn't leave partial state.
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO public._migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [filename]
        );
        await client.query('COMMIT');
        log(`     ✅ Applied: ${filename}`);
        ran += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        error(`Failed to apply ${filename}: ${err.message}`);
        error('Rolling back. Fix the migration file and re-run.');
        process.exit(1);
      }
    }

    log('');
    log(`Migration complete — applied: ${ran}, skipped: ${skipped}`);
    if (DRY_RUN) log('Re-run without --dry-run to apply changes.');
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
