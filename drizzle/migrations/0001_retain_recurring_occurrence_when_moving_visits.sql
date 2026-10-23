ALTER TABLE public.jobs ADD COLUMN recurrence_date date;
UPDATE public.jobs SET recurrence_date = scheduled_date WHERE recurring_plan_id IS NOT NULL;
COMMENT ON COLUMN public.jobs.recurrence_date IS 'Original recurring occurrence; retained when a visit is moved to prevent regeneration.';
CREATE UNIQUE INDEX jobs_recurring_occurrence_idx ON public.jobs(recurring_plan_id, recurrence_date);
CREATE OR REPLACE FUNCTION public.preserve_recurring_occurrence() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.recurring_plan_id IS NOT NULL THEN
  NEW.recurrence_date := COALESCE(OLD.recurrence_date, OLD.scheduled_date);
 ELSIF NEW.recurring_plan_id IS NOT NULL THEN
  NEW.recurrence_date := COALESCE(NEW.recurrence_date, NEW.scheduled_date);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_recurring_occurrence BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.preserve_recurring_occurrence();
CREATE OR REPLACE FUNCTION public.generate_recurring_jobs(_company uuid, _until date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; d date; step interval; n integer := 0; c integer;
BEGIN
 IF NOT public.is_manager(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 FOR p IN SELECT * FROM public.recurring_plans WHERE company_id = _company AND active LOOP
  step := CASE p.frequency WHEN 'weekly' THEN interval '7 days' WHEN 'biweekly' THEN interval '14 days' ELSE interval '1 month' END;
  d := p.start_date;
  WHILE d <= least(_until, coalesce(p.end_date, _until)) LOOP
   IF d >= current_date THEN
    INSERT INTO public.jobs (company_id, customer_id, property_id, crew_id, recurring_plan_id, title, scheduled_date, recurrence_date, price)
    VALUES (p.company_id, p.customer_id, p.property_id, p.crew_id, p.id, p.service, d, d, p.price)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
   END IF;
   d := (d + step)::date;
  END LOOP;
 END LOOP;
 RETURN n;
END $$;