-- ─────────────────────────────────────────────────────────────────────────────
-- Slotify — Supabase pg_cron Setup Script
-- Schedules WhatsApp appointment reminders every 30 minutes via pg_net
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → Paste this → Run
--
-- PREREQUISITES (do these first):
--   1. Enable pg_cron:  Dashboard → Database → Extensions → pg_cron  → ON
--   2. Enable pg_net:   Dashboard → Database → Extensions → pg_net   → ON
--   3. Set env vars in Vercel and redeploy so CRON_SECRET is active
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Confirm extensions are active ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not enabled. Enable it in Supabase Dashboard → Database → Extensions first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net is not enabled. Enable it in Supabase Dashboard → Database → Extensions first.';
  END IF;
  RAISE NOTICE 'pg_cron and pg_net are active. Proceeding...';
END $$;

-- ── Step 2: Remove any existing schedule to allow safe re-running ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-reminders') THEN
    PERFORM cron.unschedule('whatsapp-reminders');
    RAISE NOTICE 'Removed existing whatsapp-reminders schedule.';
  END IF;
END $$;

-- ── Step 3: Create the cron job ───────────────────────────────────────────────
--
-- ⚠️  REPLACE 'YOUR_CRON_SECRET_HERE' with your actual CRON_SECRET value
--     (the same one you set in Vercel Dashboard → Environment Variables)
--
SELECT cron.schedule(
  'whatsapp-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_get(
    url     => 'https://slotify-psi.vercel.app/api/cron/reminders',
    headers => '{"Authorization": "Bearer YOUR_CRON_SECRET_HERE", "User-Agent": "Supabase-pg_cron/1.0"}'::jsonb
  );
  $$
);

-- ── Step 4: Verify ────────────────────────────────────────────────────────────
SELECT
  jobid,
  jobname,
  schedule,
  active,
  -- Show a masked preview of the command (do not log secrets)
  left(command, 120) AS command_preview
FROM cron.job
WHERE jobname = 'whatsapp-reminders';
