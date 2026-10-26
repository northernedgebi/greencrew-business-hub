ALTER TABLE public.recurring_plans ADD COLUMN service_kind text NOT NULL DEFAULT 'other';
ALTER TABLE public.jobs ADD COLUMN service_kind text NOT NULL DEFAULT 'other';
UPDATE public.recurring_plans SET service_kind='lawn' WHERE service ~* '(mow|lawn|grass|cut)';
UPDATE public.jobs SET service_kind='lawn' WHERE title ~* '(mow|lawn|grass|cut)';
CREATE OR REPLACE FUNCTION public.generate_service_visits(_plan uuid, _until date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; d date; k integer:=0; n integer:=0; c integer;
BEGIN
 SELECT * INTO p FROM public.recurring_plans WHERE id=_plan;
 IF NOT FOUND OR NOT public.is_office(p.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT p.active THEN RETURN 0; END IF;
 IF _until > current_date + 730 THEN RAISE EXCEPTION 'Choose a date within two years'; END IF;
 LOOP
 d:=CASE p.frequency WHEN 'weekly' THEN p.start_date+k*7 WHEN 'biweekly' THEN p.start_date+k*14 WHEN 'yearly' THEN (p.start_date+make_interval(years=>k))::date ELSE (p.start_date+make_interval(months=>k))::date END;
 EXIT WHEN d>least(_until,coalesce(p.end_date,_until));
 IF d>=current_date THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,recurring_plan_id,title,scheduled_date,recurrence_date,price,service_kind) VALUES(p.company_id,p.customer_id,p.property_id,p.crew_id,p.id,p.service,d,d,p.price,p.service_kind) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
 END IF;
 k:=k+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_service_visits(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_service_visits(uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_recurring_jobs(_company uuid,_until date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; n integer:=0;
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 FOR p IN SELECT id FROM public.recurring_plans WHERE company_id=_company AND active LOOP n:=n+public.generate_service_visits(p.id,_until); END LOOP;
 RETURN n;
END $$;
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
 INSERT INTO public.recurring_plans(company_id,customer_id,property_id,crew_id,service,frequency,price,start_date,service_kind) VALUES(_company,_customer,pid,crew,title,freq::public.recurrence,price,day,kind) RETURNING id INTO sid;
 PERFORM public.generate_service_visits(sid,greatest(day,current_date+28));
 END IF;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_customer_with_service(_company uuid,_customer jsonb,_property jsonb,_service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; pid uuid;
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF coalesce(trim(_customer->>'name'),'')='' OR coalesce(trim(_property->>'address'),'')='' THEN RAISE EXCEPTION 'Customer name and service address required'; END IF;
 INSERT INTO public.customers(company_id,name,email,phone) VALUES(_company,trim(_customer->>'name'),nullif(_customer->>'email',''),nullif(_customer->>'phone','')) RETURNING id INTO cid;
 INSERT INTO public.properties(company_id,customer_id,address,city,state,zip) VALUES(_company,cid,trim(_property->>'address'),nullif(_property->>'city',''),nullif(_property->>'state',''),nullif(_property->>'zip','')) RETURNING id INTO pid;
 PERFORM public.add_customer_service(_company,cid,_service||jsonb_build_object('property_id',pid));
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.combine_service_visit(_service uuid,_lawn uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; m record;
BEGIN
 SELECT * INTO s FROM public.jobs WHERE id=_service FOR UPDATE;
 IF NOT FOUND OR NOT public.is_office(s.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO m FROM public.jobs WHERE id=_lawn FOR UPDATE;
 IF NOT FOUND OR m.company_id<>s.company_id OR m.customer_id<>s.customer_id OR m.property_id IS DISTINCT FROM s.property_id OR m.service_kind<>'lawn' OR s.service_kind='lawn' OR s.status<>'scheduled' OR m.status<>'scheduled' OR s.scheduled_date<current_date OR m.scheduled_date<current_date OR abs(s.scheduled_date-m.scheduled_date) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'These visits are no longer eligible to combine'; END IF;
 UPDATE public.jobs SET scheduled_date=m.scheduled_date,crew_id=m.crew_id,start_time=NULL,route_order=NULL WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.combine_service_visit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.combine_service_visit(uuid,uuid) TO authenticated;