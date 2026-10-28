ALTER TYPE public.recurrence ADD VALUE IF NOT EXISTS 'as_needed';
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.add_customer_service(uuid,uuid,jsonb)'::regprocedure) INTO d;
 d:=replace(d,'IF NOT public.is_office(_company) THEN RAISE EXCEPTION ''Forbidden''; END IF;','IF NOT public.is_office(_company) THEN RAISE EXCEPTION ''Forbidden''; END IF; IF freq=''as_needed'' THEN join_id:=NULL; END IF;');
 d:=replace(d,'today:=(current_timestamp AT TIME ZONE zone)::date;','today:=(current_timestamp AT TIME ZONE zone)::date; IF freq=''as_needed'' AND day IS NULL THEN day:=today; END IF;');
 d:=replace(d,'''yearly'',''custom'')','''yearly'',''custom'',''as_needed'')');
 d:=replace(d,'PERFORM public.generate_service_visits(sid,greatest(day,today+28),today);','IF freq<>''as_needed'' THEN PERFORM public.generate_service_visits(sid,greatest(day,today+28),today); END IF;');
 IF position('''as_needed'')' in d)=0 THEN RAISE EXCEPTION 'add_customer_service patch failed'; END IF;
 EXECUTE d;
 SELECT pg_get_functiondef('public.generate_service_visits(uuid,date,date)'::regprocedure) INTO d;
 d:=replace(d,'IF NOT p.active THEN RETURN 0; END IF;','IF NOT p.active OR p.frequency::text=''as_needed'' THEN RETURN 0; END IF;');
 IF position('as_needed' in d)=0 THEN RAISE EXCEPTION 'generate patch failed'; END IF;
 EXECUTE d;
END $$;