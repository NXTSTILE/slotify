-- Add whatsapp_sent column to notifications table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS whatsapp_sent boolean NOT NULL DEFAULT false;
