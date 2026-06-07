-- Add cancellation_reason column to appointments table
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_reason text;
