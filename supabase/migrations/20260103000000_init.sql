-- Nxtstile: enums, tables, RLS, realtime
-- Run in Supabase SQL editor or via supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE services_display_mode AS ENUM ('flat', 'grouped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'rescheduled', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_state AS ENUM (
    'IDLE',
    'SELECTING_SERVICES',
    'SELECTING_DATE',
    'SELECTING_SLOT',
    'CONFIRMING_NAME',
    'BOOKED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('new_booking', 'cancellation', 'reschedule');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- salons
CREATE TABLE IF NOT EXISTS public.salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  whatsapp_business_account_id text,
  address text,
  city text,
  cancellation_policy text,
  services_display_mode services_display_mode NOT NULL DEFAULT 'grouped',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salons_owner ON public.salons (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_salons_whatsapp_phone_id ON public.salons (whatsapp_phone_number_id) WHERE whatsapp_phone_number_id IS NOT NULL;

-- service_categories
CREATE TABLE IF NOT EXISTS public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_service_categories_salon ON public.service_categories (salon_id);

-- services
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.service_categories (id) ON DELETE SET NULL,
  name text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0 AND duration_minutes % 5 = 0),
  price numeric NOT NULL CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_services_salon ON public.services (salon_id);

-- working_hours
CREATE TABLE IF NOT EXISTS public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time,
  close_time time,
  is_closed boolean NOT NULL DEFAULT false,
  UNIQUE (salon_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_working_hours_salon ON public.working_hours (salon_id);

-- holidays
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  UNIQUE (salon_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_salon ON public.holidays (salon_id);

-- customers
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_salon ON public.customers (salon_id);

-- appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  total_duration_minutes int NOT NULL,
  total_price numeric NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pending',
  reminder_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_salon_start ON public.appointments (salon_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (salon_id, status);

-- appointment_services
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  price_at_booking numeric NOT NULL,
  duration_at_booking int NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_appt ON public.appointment_services (appointment_id);

-- conversation_states
CREATE TABLE IF NOT EXISTS public.conversation_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  state conversation_state NOT NULL DEFAULT 'IDLE',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversation_states_salon ON public.conversation_states (salon_id);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  appointment_id uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_salon ON public.notifications (salon_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_conversation_states_updated ON public.conversation_states;
CREATE TRIGGER tr_conversation_states_updated
  BEFORE UPDATE ON public.conversation_states
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RLS
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: salon ids owned by current user
-- Policies: authenticated salon owners

CREATE POLICY "salons_select_own"
  ON public.salons FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "salons_insert_own"
  ON public.salons FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "salons_update_own"
  ON public.salons FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "salons_delete_own"
  ON public.salons FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Generic tenant check function
CREATE OR REPLACE FUNCTION public.user_owns_salon(s uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.salons sals
    WHERE sals.id = s AND sals.owner_id = auth.uid()
  );
$$;

CREATE POLICY "service_categories_all_salon"
  ON public.service_categories FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "services_all_salon"
  ON public.services FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "working_hours_all_salon"
  ON public.working_hours FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "holidays_all_salon"
  ON public.holidays FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "customers_all_salon"
  ON public.customers FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "appointments_all_salon"
  ON public.appointments FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

CREATE POLICY "appointment_services_all_salon"
  ON public.appointment_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND public.user_owns_salon(a.salon_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND public.user_owns_salon(a.salon_id)
    )
  );

CREATE POLICY "conversation_states_all_salon"
  ON public.conversation_states FOR ALL TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

-- notifications: owners read only
CREATE POLICY "notifications_select_salon"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.user_owns_salon(salon_id));

CREATE POLICY "notifications_update_read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.user_owns_salon(salon_id))
  WITH CHECK (public.user_owns_salon(salon_id));

-- Service role bypasses RLS for webhook/cron inserts on notifications, conversation_states, etc.

COMMENT ON TABLE public.salons IS 'Nxtstile tenants';
COMMENT ON COLUMN public.salons.whatsapp_phone_number_id IS 'Meta WhatsApp Phone Number ID for webhook routing';
