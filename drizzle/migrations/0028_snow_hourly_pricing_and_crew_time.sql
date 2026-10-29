ALTER TABLE public.recurring_plans ADD COLUMN pricing_mode text NOT NULL DEFAULT 'flat' CHECK (pricing_mode IN ('flat','hourly')), ADD COLUMN minimum_hours numeric CHECK (minimum_hours >= 0 AND minimum_hours::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE public.jobs ADD COLUMN pricing_mode text NOT NULL DEFAULT 'flat' CHECK (pricing_mode IN ('flat','hourly')), ADD COLUMN hourly_rate numeric CHECK (hourly_rate >= 0 AND hourly_rate::text NOT IN ('NaN','Infinity','-Infinity')), ADD COLUMN minimum_hours numeric CHECK (minimum_hours >= 0 AND minimum_hours::text NOT IN ('NaN','Infinity','-Infinity')), ADD COLUMN worked_hours numeric CHECK (worked_hours >= 0 AND worked_hours::text NOT IN ('NaN','Infinity','-Infinity'));
CREATE OR REPLACE FUNCTION public.enforce_crew_job_update() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND public.has_company_role(OLD.company_id,ARRAY['technician']::public.company_role[]) AND (to_jsonb(NEW)-ARRAY['status','completed_at','worked_hours']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at','worked_hours']) THEN RAISE EXCEPTION 'Crew members may only update job status and worked hours'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Job company cannot change'; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.calculate_snow_job_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.recurring_plans%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' AND NEW.recurring_plan_id IS NOT NULL THEN
 SELECT * INTO p FROM public.recurring_plans WHERE id=NEW.recurring_plan_id AND company_id=NEW.company_id;
 IF FOUND THEN NEW.pricing_mode:=p.pricing_mode; NEW.minimum_hours:=p.minimum_hours; IF p.pricing_mode='hourly' THEN NEW.hourly_rate:=p.price; END IF; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.invoice_id IS NOT NULL AND (NEW.pricing_mode,NEW.hourly_rate,NEW.minimum_hours,NEW.worked_hours,NEW.price) IS DISTINCT FROM (OLD.pricing_mode,OLD.hourly_rate,OLD.minimum_hours,OLD.worked_hours,OLD.price) THEN RAISE EXCEPTION 'Billed visit pricing and time cannot change'; END IF;
 IF NEW.pricing_mode='hourly' THEN
 IF NEW.service_kind NOT IN ('snow_plowing','snow_removal','shoveling') OR NEW.hourly_rate IS NULL THEN RAISE EXCEPTION 'Hourly snow work needs an hourly rate'; END IF;
 IF NEW.status='completed' AND NEW.worked_hours IS NULL THEN RAISE EXCEPTION 'Enter crew worked hours before completing hourly snow work'; END IF;
 NEW.price:=CASE WHEN NEW.worked_hours IS NULL THEN 0 ELSE round(NEW.hourly_rate * greatest(NEW.worked_hours,coalesce(NEW.minimum_hours,0)),2) END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_calculate_snow_job_price BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.calculate_snow_job_price();
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.add_customer_service(uuid,uuid,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'route_order) VALUES(_company','route_order,pricing_mode,hourly_rate,minimum_hours) VALUES(_company');
 def:=replace(def,'target.route_order ELSE NULL END) RETURNING','target.route_order ELSE NULL END,coalesce(_service->>''pricing_mode'',''flat''),CASE WHEN _service->>''pricing_mode''=''hourly'' THEN price ELSE NULL END,CASE WHEN _service->>''pricing_mode''=''hourly'' THEN nullif(_service->>''minimum_hours'','''')::numeric ELSE NULL END) RETURNING');
 def:=replace(def,'times_per_year,season_start,season_end) VALUES','times_per_year,season_start,season_end,pricing_mode,minimum_hours) VALUES');
 def:=replace(def,'s_start,s_end) RETURNING','s_start,s_end,coalesce(_service->>''pricing_mode'',''flat''),CASE WHEN _service->>''pricing_mode''=''hourly'' THEN nullif(_service->>''minimum_hours'','''')::numeric ELSE NULL END) RETURNING');
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.validate_snow_plan_pricing() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN
 IF NEW.pricing_mode='hourly' AND NEW.service_kind NOT IN ('snow_plowing','snow_removal','shoveling') THEN RAISE EXCEPTION 'Hourly pricing is for winter services'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER validate_snow_plan_pricing BEFORE INSERT OR UPDATE ON public.recurring_plans FOR EACH ROW EXECUTE FUNCTION public.validate_snow_plan_pricing();