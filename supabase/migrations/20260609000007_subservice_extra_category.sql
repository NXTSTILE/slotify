-- Migration: add extra_category to subservices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subservices' AND column_name = 'extra_category'
  ) THEN
    ALTER TABLE public.subservices
      ADD COLUMN extra_category VARCHAR(255) DEFAULT NULL;
  END IF;
END $$;
