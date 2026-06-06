-- Add soft delete flags for salons and appointments

ALTER TABLE public.salons
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Add indexes for better query performance on these flags
CREATE INDEX IF NOT EXISTS idx_salons_is_deleted ON public.salons (is_deleted);
CREATE INDEX IF NOT EXISTS idx_appointments_is_deleted ON public.appointments (is_deleted);
