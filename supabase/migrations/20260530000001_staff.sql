-- Staff per salon: names and service specializations
-- Run after 20260103000000_init.sql

-- staff table
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_salon ON public.staff (salon_id);

-- staff_services: which services a staff member can perform
CREATE TABLE IF NOT EXISTS public.staff_services (
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_services_staff ON public.staff_services (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_service ON public.staff_services (service_id);

-- Add staff_id FK to appointments (nullable — existing rows unaffected)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_staff ON public.appointments (staff_id);

COMMENT ON TABLE public.staff IS 'Staff members per salon with their service specializations';
COMMENT ON TABLE public.staff_services IS 'Many-to-many: staff can perform these services';
COMMENT ON COLUMN public.appointments.staff_id IS 'Assigned staff member for this appointment (null = unassigned / no staff configured)';
