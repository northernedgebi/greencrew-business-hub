ALTER TABLE public.recurring_plans ADD COLUMN season_start text;
ALTER TABLE public.recurring_plans ADD COLUMN season_end text;
ALTER TABLE public.recurring_plans ADD CONSTRAINT recurring_plans_season_format CHECK (
  (season_start IS NULL AND season_end IS NULL) OR
  (season_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' AND season_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
);
COMMENT ON COLUMN public.recurring_plans.season_start IS 'MM-DD season opening (e.g. 05-01); null = year-round';
COMMENT ON COLUMN public.recurring_plans.season_end IS 'MM-DD season closing (e.g. 10-31); may be earlier than season_start for windows wrapping year-end';
CREATE OR REPLACE FUNCTION public.in_service_season(_date date, _start text, _end text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _start IS NULL OR _end IS NULL OR CASE WHEN _start <= _end THEN to_char(_date,'MM-DD') BETWEEN _start AND _end ELSE to_char(_date,'MM-DD') >= _start OR to_char(_date,'MM-DD') <= _end END
$$;
CREATE OR REPLACE FUNCTION public.generate_service_visits(_plan uuid, _until date, _today date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; d date; k integer:=0; n integer:=0; c integer; step integer:=0;
BEGIN
 SELECT * INTO p FROM public.recurring_plans WHERE id=_plan;
 IF NOT FOUND OR NOT public.is_office(p.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _today IS NULL OR abs(_today-current_date)>1 THEN RAISE EXCEPTION 'Invalid local calendar date'; END IF;
 IF NOT p.active THEN RETURN 0; END IF;
 IF _until > _today + 730 THEN RAISE EXCEPTION 'Choose a date within two years'; END IF;
 IF p.frequency='custom' THEN step:=GREATEST(7,round(365.0/COALESCE(NULLIF(p.times_per_year,0),12))::int); END IF;
 LOOP
  d:=CASE p.frequency WHEN 'weekly' THEN p.start_date+k*7 WHEN 'biweekly' THEN p.start_date+k*14 WHEN 'custom' THEN p.start_date+k*step WHEN 'yearly' THEN (p.start_date+make_interval(years=>k))::date ELSE (p.start_date+make_interval(months=>k))::date END;
 EXIT WHEN d>least(_until,coalesce(p.end_date,_until));
 IF d>=_today AND public.in_service_season(d, p.season_start, p.season_end) THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,recurring_plan_id,title,scheduled_date,recurrence_date,price,service_kind) VALUES(p.company_id,p.customer_id,p.property_id,p.crew_id,p.id,p.service,d,d,p.price,p.service_kind) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
 END IF;
 k:=k+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_service_visits(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_service_visits(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_service_visits(_plan uuid, _until date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.generate_service_visits(_plan,_until,current_date); END $$;
CREATE OR REPLACE FUNCTION public.add_customer_service(_company uuid,_customer uuid,_service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; pid uuid:=(_service->>'property_id')::uuid; crew uuid:=nullif(_service->>'crew_id','')::uuid; day date:=(_service->>'date')::date; price numeric:=(_service->>'price')::numeric; freq text:=_service->>'frequency'; title text:=trim(_service->>'title'); kind text:=coalesce(_service->>'kind','other'); zone text:=coalesce(nullif(_service->>'timezone',''),'UTC'); today date; tp integer:=nullif(_service->>'times_per_year','')::int; s_start text:=nullif(_service->>'season_start',''); s_end text:=nullif(_service->>'season_end','');
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Choose a valid calendar time zone'; END IF;
 today:=(current_timestamp AT TIME ZONE zone)::date;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=_customer AND company_id=_company) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=pid AND customer_id=_customer AND company_id=_company) THEN RAISE EXCEPTION 'Choose a property belonging to this customer'; END IF;
 IF crew IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crews WHERE id=crew AND company_id=_company) THEN RAISE EXCEPTION 'Choose a crew from this company'; END IF;
 IF title IS NULL OR length(title)=0 THEN RAISE EXCEPTION 'Enter a service name'; END IF;
 IF price IS NULL OR price<0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a price of zero or more'; END IF;
 IF day IS NULL OR day<today OR day>today+730 THEN RAISE EXCEPTION 'Choose today or a future service date within two years'; END IF;
 IF kind NOT IN ('lawn','other') THEN RAISE EXCEPTION 'Choose a service category'; END IF;
 IF freq IS NULL OR freq NOT IN ('once','weekly','biweekly','monthly','yearly','custom') THEN RAISE EXCEPTION 'Choose how often the service repeats'; END IF;
 IF freq='custom' AND (tp IS NULL OR tp<2 OR tp>51) THEN RAISE EXCEPTION 'Choose how many times a year, between 2 and 51'; END IF;
 IF (s_start IS NULL) <> (s_end IS NULL) THEN RAISE EXCEPTION 'Choose both a season start and season end, or neither'; END IF;
 IF s_start IS NOT NULL AND (s_start !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR s_end !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$') THEN RAISE EXCEPTION 'Season dates must be valid month-day values'; END IF;
 IF freq='once' THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,title,scheduled_date,price,notes,service_kind) VALUES(_company,_customer,pid,crew,title,day,price,nullif(_service->>'notes',''),kind) RETURNING id INTO sid;
 ELSE
 INSERT INTO public.recurring_plans(company_id,customer_id,property_id,crew_id,service,frequency,price,start_date,service_kind,notes,times_per_year,season_start,season_end) VALUES(_company,_customer,pid,crew,title,freq::public.recurrence,price,day,kind,nullif(_service->>'notes',''),CASE WHEN freq='custom' THEN tp ELSE NULL END,s_start,s_end) RETURNING id INTO sid;
 PERFORM public.generate_service_visits(sid,greatest(day,today+28),today);
 END IF;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_customer_service(uuid,uuid,jsonb) TO authenticated;