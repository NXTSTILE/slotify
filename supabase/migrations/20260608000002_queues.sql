-- Rename staff table to queues
ALTER TABLE public.staff RENAME TO queues;

-- Rename references in appointments
ALTER TABLE public.appointments RENAME COLUMN staff_id TO queue_id;

-- Drop staff_services since queues can handle all services
DROP TABLE IF EXISTS public.staff_services;
