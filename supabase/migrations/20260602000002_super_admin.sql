-- Add is_super_admin flag to users table
-- Run after 20260530000001_staff.sql

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- Promote the oldest registered user to Super Admin for seamless bootstrapping
UPDATE public.users 
SET is_super_admin = true 
WHERE id = (
  SELECT id FROM public.users 
  ORDER BY created_at ASC 
  LIMIT 1
);

COMMENT ON COLUMN public.users.is_super_admin IS 'True if user has global platform management rights';
