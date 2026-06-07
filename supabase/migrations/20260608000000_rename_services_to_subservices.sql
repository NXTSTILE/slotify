-- Rename the table 'services' to 'subservices'
ALTER TABLE public.services RENAME TO subservices;

-- Rename the table 'service_categories' to 'services'
ALTER TABLE public.service_categories RENAME TO services;

-- Rename the foreign key column in 'subservices' from 'category_id' to 'service_id'
ALTER TABLE public.subservices RENAME COLUMN category_id TO service_id;

-- Create the new 'subservice_tier' enum safely
DO $$ BEGIN
  CREATE TYPE subservice_tier AS ENUM ('basic', 'medium', 'premium');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add the 'tier' column to 'subservices'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subservices' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.subservices ADD COLUMN tier subservice_tier;
  END IF;
END $$;

-- Note: The display_order column already exists on both tables and will be used
-- to ensure the order of services and subservices matches what the salon configures.
