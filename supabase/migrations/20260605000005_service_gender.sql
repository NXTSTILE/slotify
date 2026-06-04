-- Migration: add gender_tag to services and SELECTING_GENDER to conversation_state
-- Services can be tagged male / female / unisex (default).
-- The WhatsApp bot uses gender_tag to filter the service list shown to each customer.

-- 1. Create the gender enum (idempotent)
DO $$ BEGIN
  CREATE TYPE service_gender_tag AS ENUM ('male', 'female', 'unisex');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add gender_tag column to services (default unisex so existing services are unaffected)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'gender_tag'
  ) THEN
    ALTER TABLE public.services
      ADD COLUMN gender_tag service_gender_tag NOT NULL DEFAULT 'unisex';
  END IF;
END $$;

-- 3. Add SELECTING_GENDER state to the conversation_state enum
ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'SELECTING_GENDER';

-- Index for efficient gender-filtered service lookups
CREATE INDEX IF NOT EXISTS idx_services_gender ON public.services (salon_id, gender_tag)
  WHERE is_active = true;

COMMENT ON COLUMN public.services.gender_tag IS
  'Controls which customers see this service in the WhatsApp bot: male, female, or unisex (shown to all).';
