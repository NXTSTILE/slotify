/**
 * Unified Bootstrap Runner
 * Runs database migrations first, then boots the Next.js production server.
 * Ensures the entire container lifecycle remains in a single Node.js process.
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
