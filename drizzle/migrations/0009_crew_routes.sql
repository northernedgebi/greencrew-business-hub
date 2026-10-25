ALTER TABLE public.crews ADD COLUMN start_address text, ADD COLUMN start_lat double precision, ADD COLUMN start_lng double precision;
ALTER TABLE public.jobs ADD COLUMN route_order integer;
CREATE INDEX IF NOT EXISTS jobs_route_idx ON public.jobs (company_id, scheduled_date, crew_id, route_order);