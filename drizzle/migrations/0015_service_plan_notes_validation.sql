ALTER TABLE public.recurring_plans ADD COLUMN notes text;
CREATE OR REPLACE FUNCTION public.validate_service_plan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id) THEN RAISE EXCEPTION 'Service customer and company cannot change'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=NEW.customer_id AND company_id=NEW.company_id) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=NEW.property_id AND customer_id=NEW.customer_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Choose this customer’s property'; END IF;
 IF NEW.crew_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crews WHERE id=NEW.crew_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Choose a crew from this company'; END IF;
 IF NEW.price<0 OR NEW.service_kind NOT IN ('lawn','other') THEN RAISE EXCEPTION 'Invalid service price or category'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_service_plan BEFORE INSERT OR UPDATE ON public.recurring_plans FOR EACH ROW EXECUTE FUNCTION public.validate_service_plan();
CREATE OR REPLACE FUNCTION public.copy_service_notes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='recurring_plans' THEN
 NEW.notes:=nullif(current_setting('lawnoffice.service_notes',true),'');
 ELSE
 IF NEW.recurring_plan_id IS NOT NULL AND NEW.notes IS NULL THEN SELECT notes INTO NEW.notes FROM public.recurring_plans WHERE id=NEW.recurring_plan_id AND company_id=NEW.company_id; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copy_service_notes BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.copy_service_notes();