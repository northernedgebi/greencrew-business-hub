CREATE OR REPLACE FUNCTION public.validate_service_plan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id) THEN RAISE EXCEPTION 'Service customer and company cannot change'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=NEW.customer_id AND company_id=NEW.company_id) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=NEW.property_id AND customer_id=NEW.customer_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Choose this customer’s property'; END IF;
 IF NEW.crew_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crews WHERE id=NEW.crew_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Choose a crew from this company'; END IF;
 IF NEW.price<0 OR NEW.service_kind NOT IN ('lawn','other','snow_plowing','snow_removal','shoveling') THEN RAISE EXCEPTION 'Invalid service price or category'; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.add_customer_service(_company uuid, _customer uuid, _service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; pid uuid:=(_service->>'property_id')::uuid; crew uuid:=nullif(_service->>'crew_id','')::uuid; day date:=(_service->>'date')::date; price numeric:=(_service->>'price')::numeric; freq text:=_service->>'frequency'; title text:=trim(_service->>'title'); kind text:=coalesce(_service->>'kind','other'); zone text:=coalesce(nullif(_service->>'timezone',''),'UTC'); today date; tp integer:=nullif(_service->>'times_per_year','')::int; s_start text:=nullif(_service->>'season_start',''); s_end text:=nullif(_service->>'season_end',''); target record; join_id uuid:=nullif(_service->>'join_job_id','')::uuid;
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Choose a valid calendar time zone'; END IF;
 today:=(current_timestamp AT TIME ZONE zone)::date;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=_customer AND company_id=_company) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=pid AND customer_id=_customer AND company_id=_company) THEN RAISE EXCEPTION 'Choose a property belonging to this customer'; END IF;
 IF join_id IS NOT NULL THEN
 SELECT * INTO target FROM public.jobs WHERE id=join_id AND company_id=_company AND customer_id=_customer AND property_id=pid AND status IN ('scheduled','in_progress') AND scheduled_date>=today AND crew_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That crew visit is no longer available at this address'; END IF;
 day:=target.scheduled_date; crew:=target.crew_id;
 END IF;
 IF crew IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crews WHERE id=crew AND company_id=_company) THEN RAISE EXCEPTION 'Choose a crew from this company'; END IF;
 IF title IS NULL OR length(title)=0 THEN RAISE EXCEPTION 'Enter a service name'; END IF;
 IF price IS NULL OR price<0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a price of zero or more'; END IF;
 IF day IS NULL OR day<today OR day>today+730 THEN RAISE EXCEPTION 'Choose today or a future service date within two years'; END IF;
 IF kind NOT IN ('lawn','other','snow_plowing','snow_removal','shoveling') THEN RAISE EXCEPTION 'Choose a service category'; END IF;
 IF freq IS NULL OR freq NOT IN ('once','weekly','biweekly','monthly','yearly','custom') THEN RAISE EXCEPTION 'Choose how often the service repeats'; END IF;
 IF freq='custom' AND (tp IS NULL OR tp<2 OR tp>51) THEN RAISE EXCEPTION 'Choose how many times a year, between 2 and 51'; END IF;
 IF (s_start IS NULL) <> (s_end IS NULL) THEN RAISE EXCEPTION 'Choose both a season start and season end, or neither'; END IF;
 IF s_start IS NOT NULL AND (s_start !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR s_end !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$') THEN RAISE EXCEPTION 'Season dates must be valid month-day values'; END IF;
 IF join_id IS NOT NULL AND freq<>'once' AND NOT public.in_service_season(day,s_start,s_end) THEN RAISE EXCEPTION 'The first shared visit must be inside the service season'; END IF;
 IF freq='once' THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,title,scheduled_date,price,notes,service_kind,route_order) VALUES(_company,_customer,pid,crew,title,day,price,nullif(_service->>'notes',''),kind,CASE WHEN join_id IS NOT NULL THEN target.route_order ELSE NULL END) RETURNING id INTO sid;
 ELSE
 INSERT INTO public.recurring_plans(company_id,customer_id,property_id,crew_id,service,frequency,price,start_date,service_kind,notes,times_per_year,season_start,season_end) VALUES(_company,_customer,pid,crew,title,freq::public.recurrence,price,day,kind,nullif(_service->>'notes',''),CASE WHEN freq='custom' THEN tp ELSE NULL END,s_start,s_end) RETURNING id INTO sid;
 PERFORM public.generate_service_visits(sid,greatest(day,today+28),today);
 IF join_id IS NOT NULL THEN UPDATE public.jobs SET route_order=target.route_order WHERE recurring_plan_id=sid AND recurrence_date=day; END IF;
 END IF;
 RETURN sid;
END $$;
CREATE OR REPLACE FUNCTION public.create_customer_with_service(_company uuid, _customer jsonb, _property jsonb, _service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; pid uuid; services jsonb; item jsonb;
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF coalesce(trim(_customer->>'name'),'')='' OR coalesce(trim(_property->>'address'),'')='' THEN RAISE EXCEPTION 'Customer name and service address required'; END IF;
 IF coalesce(_customer->>'customer_type','residential') NOT IN ('residential','commercial') THEN RAISE EXCEPTION 'Customer type must be residential or commercial'; END IF;
 services:=CASE WHEN jsonb_typeof(_service)='array' THEN _service ELSE jsonb_build_array(_service) END;
 IF jsonb_array_length(services)=0 THEN RAISE EXCEPTION 'Select at least one service'; END IF;
 INSERT INTO public.customers(company_id,name,email,phone,customer_type,ein) VALUES(_company,trim(_customer->>'name'),nullif(_customer->>'email',''),nullif(_customer->>'phone',''),coalesce(_customer->>'customer_type','residential'),nullif(trim(_customer->>'ein'),'')) RETURNING id INTO cid;
 INSERT INTO public.properties(company_id,customer_id,address,city,state,zip,gate_code) VALUES(_company,cid,trim(_property->>'address'),nullif(_property->>'city',''),nullif(_property->>'state',''),nullif(_property->>'zip',''),nullif(trim(_property->>'gate_code'),'')) RETURNING id INTO pid;
 FOR item IN SELECT value FROM jsonb_array_elements(services) LOOP
 PERFORM public.add_customer_service(_company,cid,item||jsonb_build_object('property_id',pid));
 END LOOP;
 RETURN cid;
END $$;
CREATE OR REPLACE FUNCTION public.join_service_visit(_service uuid, _target uuid, _timezone text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; t record; today date;
BEGIN
 IF _service=_target THEN RAISE EXCEPTION 'Choose a different crew visit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_timezone) THEN RAISE EXCEPTION 'Choose a valid calendar time zone'; END IF;
 today:=(current_timestamp AT TIME ZONE _timezone)::date;
 PERFORM id FROM public.jobs WHERE id IN (_service,_target) ORDER BY id FOR UPDATE;
 SELECT * INTO s FROM public.jobs WHERE id=_service;
 IF NOT FOUND OR NOT public.is_office(s.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO t FROM public.jobs WHERE id=_target;
 IF NOT FOUND OR t.company_id<>s.company_id OR t.customer_id<>s.customer_id OR s.property_id IS NULL OR t.property_id IS DISTINCT FROM s.property_id OR s.status<>'scheduled' OR t.status NOT IN ('scheduled','in_progress') OR t.crew_id IS NULL OR s.scheduled_date<today OR t.scheduled_date<today THEN RAISE EXCEPTION 'Choose an upcoming crew visit at the same customer address'; END IF;
 UPDATE public.jobs SET scheduled_date=t.scheduled_date,crew_id=t.crew_id,start_time=NULL,route_order=t.route_order WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.join_service_visit(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.join_service_visit(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) TO authenticated;