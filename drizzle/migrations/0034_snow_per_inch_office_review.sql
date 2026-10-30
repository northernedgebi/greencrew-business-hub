ALTER TABLE public.recurring_plans DROP CONSTRAINT recurring_plans_pricing_mode_check;
ALTER TABLE public.recurring_plans ADD CONSTRAINT recurring_plans_pricing_mode_check CHECK (pricing_mode IN ('flat','hourly','per_inch'));
ALTER TABLE public.jobs DROP CONSTRAINT jobs_pricing_mode_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_pricing_mode_check CHECK (pricing_mode IN ('flat','hourly','per_inch'));
ALTER TABLE public.jobs ADD COLUMN per_inch_rate numeric CHECK (per_inch_rate>=0 AND per_inch_rate::text NOT IN ('NaN','Infinity','-Infinity')), ADD COLUMN snow_reviewed_at timestamptz, ADD COLUMN snow_reviewed_by uuid;
CREATE OR REPLACE FUNCTION public.validate_snow_plan_pricing() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.pricing_mode IN ('hourly','per_inch') AND NEW.service_kind NOT IN ('snow_plowing','snow_removal','shoveling') THEN RAISE EXCEPTION 'Measured pricing is for winter services'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.enforce_crew_job_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND public.has_company_role(OLD.company_id,ARRAY['technician']::public.company_role[]) AND (to_jsonb(NEW)-ARRAY['status','completed_at','worked_hours','snow_inches']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at','worked_hours','snow_inches']) THEN RAISE EXCEPTION 'Crew members may only update status, worked hours and snow inches'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Job company cannot change'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.calculate_snow_job_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.recurring_plans%ROWTYPE; changed boolean:=false;
BEGIN
 IF TG_OP='INSERT' AND NEW.recurring_plan_id IS NOT NULL THEN
 SELECT * INTO p FROM public.recurring_plans WHERE id=NEW.recurring_plan_id AND company_id=NEW.company_id;
 IF FOUND THEN NEW.pricing_mode:=p.pricing_mode; NEW.minimum_hours:=p.minimum_hours; IF p.pricing_mode='hourly' THEN NEW.hourly_rate:=p.price; ELSIF p.pricing_mode='per_inch' THEN NEW.per_inch_rate:=p.price; END IF; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.pricing_mode='per_inch' AND NEW.per_inch_rate IS NULL THEN NEW.per_inch_rate:=NEW.price; END IF;
 IF TG_OP='INSERT' THEN NEW.snow_reviewed_at:=NULL; NEW.snow_reviewed_by:=NULL;
 ELSE
 changed:=(NEW.pricing_mode,NEW.per_inch_rate,NEW.snow_inches,NEW.status,NEW.customer_id,NEW.property_id,NEW.scheduled_date,NEW.snow_trips,NEW.snow_method) IS DISTINCT FROM (OLD.pricing_mode,OLD.per_inch_rate,OLD.snow_inches,OLD.status,OLD.customer_id,OLD.property_id,OLD.scheduled_date,OLD.snow_trips,OLD.snow_method);
 IF OLD.invoice_id IS NOT NULL AND (NEW.pricing_mode,NEW.hourly_rate,NEW.minimum_hours,NEW.worked_hours,NEW.price,NEW.per_inch_rate,NEW.snow_inches,NEW.snow_reviewed_at,NEW.snow_reviewed_by) IS DISTINCT FROM (OLD.pricing_mode,OLD.hourly_rate,OLD.minimum_hours,OLD.worked_hours,OLD.price,OLD.per_inch_rate,OLD.snow_inches,OLD.snow_reviewed_at,OLD.snow_reviewed_by) THEN RAISE EXCEPTION 'Billed visit pricing and measurements cannot change'; END IF;
 IF (NEW.snow_reviewed_at,NEW.snow_reviewed_by) IS DISTINCT FROM (OLD.snow_reviewed_at,OLD.snow_reviewed_by) THEN
 IF auth.uid() IS NULL OR NOT public.is_office(OLD.company_id) THEN RAISE EXCEPTION 'Only the office can approve snow measurements'; END IF;
 IF NEW.snow_reviewed_at IS NOT NULL THEN
 IF NEW.status<>'completed' OR NEW.pricing_mode<>'per_inch' OR changed THEN RAISE EXCEPTION 'Save completed measurements before approving'; END IF;
 NEW.snow_reviewed_at:=now(); NEW.snow_reviewed_by:=auth.uid();
 ELSE NEW.snow_reviewed_by:=NULL; END IF;
 END IF;
 IF changed THEN NEW.snow_reviewed_at:=NULL; NEW.snow_reviewed_by:=NULL; END IF;
 END IF;
 IF NEW.snow_inches IS NOT NULL AND (NEW.snow_inches<0 OR NEW.snow_inches::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Enter valid non-negative snow inches'; END IF;
 IF NEW.pricing_mode='hourly' THEN
 IF NEW.service_kind NOT IN ('snow_plowing','snow_removal','shoveling') OR NEW.hourly_rate IS NULL THEN RAISE EXCEPTION 'Hourly snow work needs an hourly rate'; END IF;
 IF NEW.status='completed' AND NEW.worked_hours IS NULL THEN RAISE EXCEPTION 'Enter crew worked hours before completing hourly snow work'; END IF;
 NEW.price:=CASE WHEN NEW.worked_hours IS NULL THEN 0 ELSE round(NEW.hourly_rate*greatest(NEW.worked_hours,coalesce(NEW.minimum_hours,0)),2) END;
 ELSIF NEW.pricing_mode='per_inch' THEN
 IF NEW.service_kind NOT IN ('snow_plowing','snow_removal','shoveling') OR NEW.per_inch_rate IS NULL THEN RAISE EXCEPTION 'Per-inch snow work needs a rate per inch'; END IF;
 IF NEW.status='completed' AND NEW.snow_inches IS NULL THEN RAISE EXCEPTION 'Enter snow inches before completing per-inch work'; END IF;
 NEW.price:=round(NEW.per_inch_rate*coalesce(NEW.snow_inches,0),2);
 IF NEW.invoice_id IS NOT NULL AND (NEW.status<>'completed' OR NEW.snow_reviewed_at IS NULL) THEN RAISE EXCEPTION 'Office approval of snow inches is required before invoicing'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.approve_snow_visit(_job uuid,_inches numeric,_rate numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.jobs%ROWTYPE; BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR NOT public.is_office(j.company_id) THEN RAISE EXCEPTION 'Office access required'; END IF;
 IF j.pricing_mode<>'per_inch' OR j.status<>'completed' OR j.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Choose completed, unbilled per-inch work'; END IF;
 IF j.snow_inches IS DISTINCT FROM _inches OR j.per_inch_rate IS DISTINCT FROM _rate THEN RAISE EXCEPTION 'Measurements changed. Refresh and review again'; END IF;
 UPDATE public.jobs SET snow_reviewed_at=now(),snow_reviewed_by=auth.uid() WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION public.approve_snow_visit(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_snow_visit(uuid,numeric,numeric) TO authenticated;
DO $$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('public.add_customer_service(uuid,uuid,jsonb)'::regprocedure);
 def:=replace(def,'route_order,pricing_mode,hourly_rate,minimum_hours) VALUES','route_order,pricing_mode,hourly_rate,minimum_hours,per_inch_rate) VALUES');
 def:=replace(def,'ELSE NULL END) RETURNING id INTO sid;', 'ELSE NULL END,CASE WHEN _service->>''pricing_mode''=''per_inch'' THEN price ELSE NULL END) RETURNING id INTO sid;');
 -- Only the one-time INSERT ends with ELSE NULL END; recurring INSERT ends with the same phrase, so target it separately if needed.
 def:=replace(def,'pricing_mode,minimum_hours) VALUES','pricing_mode,minimum_hours,per_inch_rate) VALUES');
 -- Recurring plans use price as the rate; remove the extra column/value from that INSERT.
 def:=replace(def,'season_end,pricing_mode,minimum_hours,per_inch_rate) VALUES','season_end,pricing_mode,minimum_hours) VALUES');
 def:=replace(def,'s_start,s_end,coalesce(_service->>''pricing_mode'',''flat''),CASE WHEN _service->>''pricing_mode''=''hourly'' THEN nullif(_service->>''minimum_hours'','''')::numeric ELSE NULL END,CASE WHEN _service->>''pricing_mode''=''per_inch'' THEN price ELSE NULL END)', 's_start,s_end,coalesce(_service->>''pricing_mode'',''flat''),CASE WHEN _service->>''pricing_mode''=''hourly'' THEN nullif(_service->>''minimum_hours'','''')::numeric ELSE NULL END)');
 EXECUTE def;
 def:=pg_get_functiondef('public.validate_invoice_job_charge()'::regprocedure);
 def:=replace(def,'IF j.monthly_included THEN','IF j.pricing_mode=''per_inch'' AND (j.status<>''completed'' OR j.snow_reviewed_at IS NULL) THEN RAISE EXCEPTION ''Office approval of snow inches is required before invoicing''; END IF; IF j.pricing_mode=''per_inch'' AND NEW.quantity*NEW.unit_price<>j.price THEN RAISE EXCEPTION ''Invoice charge must match approved snow measurements''; END IF; IF j.monthly_included THEN'); EXECUTE def;
 def:=pg_get_functiondef('public.generate_customer_monthly_invoice(uuid,date)'::regprocedure);
 def:=replace(def,'AND NOT monthly_included AND scheduled_date<period_end','AND NOT monthly_included AND (pricing_mode<>''per_inch'' OR snow_reviewed_at IS NOT NULL) AND scheduled_date<period_end');
 def:=replace(def,'AND NOT jobs.monthly_included AND jobs.scheduled_date<period_end','AND NOT jobs.monthly_included AND (jobs.pricing_mode<>''per_inch'' OR jobs.snow_reviewed_at IS NOT NULL) AND jobs.scheduled_date<period_end'); EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.guard_snow_invoice_send() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status NOT IN ('draft','void') AND EXISTS(SELECT 1 FROM public.invoice_items i JOIN public.jobs j ON j.id=i.job_id WHERE i.invoice_id=NEW.id AND j.pricing_mode='per_inch' AND (j.snow_reviewed_at IS NULL OR j.status<>'completed')) THEN RAISE EXCEPTION 'Review snow measurements before sending this invoice'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_snow_invoice_send BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_snow_invoice_send();