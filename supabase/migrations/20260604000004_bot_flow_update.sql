-- Migration: add SELECTING_SESSION enum value to conversation_state
-- The bot flow now uses SELECTING_SESSION (choose Morning/Evening) instead of SELECTING_SLOT.
-- We keep SELECTING_SLOT for backwards compatibility (no active rows should use it after deploy).

ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'SELECTING_SESSION';

-- Also ensure the appointments table has a created_at column for expired pending slot purging.
-- (This column already exists in the init migration, but guard with IF NOT EXISTS for safety.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.appointments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Index to efficiently purge expired pending appointments
CREATE INDEX IF NOT EXISTS idx_appointments_pending_created ON public.appointments (salon_id, status, created_at)
  WHERE status = 'pending';
