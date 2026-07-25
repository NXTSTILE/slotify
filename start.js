/**
 * DOCKER ENTRYPOINT ONLY — Not used on Vercel.
 *
 * Vercel manages the Next.js process lifecycle natively via `next start`.
 * This file is the CMD entrypoint for the Docker container (see Dockerfile).
 * It runs DB migrations then boots the Next.js standalone server.
 *
 * For production migrations on Vercel, use:
 *   node scripts/run-migrations-prod.js
 */

const runMigrations = require('./run-migrations.js');

async function bootstrap() {
  console.log('[Startup] Bootstrapping application...');

  try {
    console.log('[Startup] Step 1: Running database migrations...');
    await runMigrations();
    console.log('[Startup] Database migrations completed successfully.');
  } catch (err) {
    console.error('[Startup] Migrations encountered an error:', err);
  }

  console.log('[Startup] Step 2: Starting Next.js production server...');
  try {
    // Import and execute Next.js standalone server.js
    require('./server.js');
  } catch (err) {
    console.error('[Startup] Failed to start Next.js production server:', err);
    process.exit(1);
  }
}

bootstrap();
