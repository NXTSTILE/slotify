-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Enable pg_cron + pg_net and schedule WhatsApp reminder cron job
--
-- ⚠️  BEFORE RUNNING THIS MIGRATION:
--
--   1. Enable these extensions in Supabase Dashboard first:
--      Dashboard → Database → Extensions → search "pg_cron" → Enable
--      Dashboard → Database → Extensions → search "pg_net"  → Enable
--
--   2. Set CRON_SECRET in Vercel Dashboard:
--      vercel.com/bookly/slotify/settings/environment-variables
--      Then click Redeploy.
--
--   3. Replace YOUR_CRON_SECRET_HERE below with your actual CRON_SECRET value
--      before running this file.
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule with this name to allow re-running safely
SELECT cron.unschedule('whatsapp-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-reminders'
);

-- Schedule the WhatsApp reminder cron: fires every 30 minutes
-- This calls the Vercel serverless function at /api/cron/reminders
SELECT cron.schedule(
  'whatsapp-reminders',
  '*/30 * * * *',
  format(
    $$
    SELECT net.http_get(
      url     => 'https://slotify-psi.vercel.app/api/cron/reminders',
      headers => jsonb_build_object(
        'Authorization', 'Bearer %s',
        'User-Agent',    'Supabase-pg_cron/1.0'
      )
    );
    $$,
    'YOUR_CRON_SECRET_HERE'   -- ← Replace this with your actual CRON_SECRET
  )
);

-- Verify the job was created
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'whatsapp-reminders';
