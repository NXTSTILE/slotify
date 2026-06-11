-- Add break_start_time and break_end_time to public.working_hours
ALTER TABLE public.working_hours ADD COLUMN IF NOT EXISTS break_start_time time;
ALTER TABLE public.working_hours ADD COLUMN IF NOT EXISTS break_end_time time;
