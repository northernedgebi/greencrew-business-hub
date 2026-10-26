CREATE OR REPLACE FUNCTION public.add_customer_service(_company uuid,_customer uuid,_service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; pid uuid:=(_service->>'property_id')::uuid; crew uuid:=nullif(_service->>'crew_id','')::uuid; day date:=(_service->>'date')::date; price numeric:=(_service->>'price')::numeric; freq text:=_service->>'frequency'; title text:=trim(_service->>'title'); kind text:=coalesce(_service->>'kind','other');
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=_customer AND company_id=_company) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=pid AND customer_id=_customer AND company_id=_company) THEN RAISE EXCEPTION 'Choose this customer’s property'; END IF;
 IF crew IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crews WHERE id=crew AND company_id=_company) THEN RAISE EXCEPTION 'Choose a crew from this company'; END IF;
 IF title IS NULL OR length(title)=0 OR price IS NULL OR price<0 OR day IS NULL OR day<current_date OR day>current_date+730 OR kind NOT IN ('lawn','other') OR freq IS NULL OR freq NOT IN ('once','weekly','biweekly','monthly','yearly') THEN RAISE EXCEPTION 'Provide a service, nonnegative price and upcoming date within two years'; END IF;
 IF freq='once' THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,title,scheduled_date,price,notes,service_kind) VALUES(_company,_customer,pid,crew,title,day,price,nullif(_service->>'notes',''),kind) RETURNING id INTO sid;
 ELSE
 INSERT INTO public.recurring_plans(company_id,customer_id,property_id,crew_id,service,frequency,price,start_date,service_kind,notes) VALUES(_company,_customer,pid,crew,title,freq::public.recurrence,price,day,kind,nullif(_service->>'notes','')) RETURNING id INTO sid;
 PERFORM public.generate_service_visits(sid,greatest(day,current_date+28));
 END IF;
 RETURN sid;
END $$;
CREATE OR REPLACE FUNCTION public.copy_service_notes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.recurring_plan_id IS NOT NULL AND NEW.notes IS NULL THEN SELECT notes INTO NEW.notes FROM public.recurring_plans WHERE id=NEW.recurring_plan_id AND company_id=NEW.company_id; END IF;
 RETURN NEW;
END $$;