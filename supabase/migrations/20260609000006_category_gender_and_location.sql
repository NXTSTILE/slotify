-- Migration: add gender_tag to services (categories), custom_message to salons, and ASKING_LOCATION to conversation_state

-- 1. Add gender_tag column to services (categories) table, referencing service_gender_tag enum
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

-- 2. Add custom_message column to salons table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'salons' AND column_name = 'custom_message'
  ) THEN
    ALTER TABLE public.salons
      ADD COLUMN custom_message text;
  END IF;
END $$;

-- 3. Add ASKING_LOCATION value to conversation_state enum
ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'ASKING_LOCATION';

-- Index for category gender tag filtering
CREATE INDEX IF NOT EXISTS idx_services_category_gender ON public.services (salon_id, gender_tag);
