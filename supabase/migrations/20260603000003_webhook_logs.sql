-- Create webhook logs table for diagnostic purposes
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  headers jsonb,
  body text,
  error text
);
