ALTER TABLE public.company_members ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL, ADD COLUMN schedule_visible_from date, ADD COLUMN schedule_visible_until date;
ALTER TABLE public.company_invites ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL, ADD COLUMN schedule_visible_from date, ADD COLUMN schedule_visible_until date;
ALTER TABLE public.company_members ADD CONSTRAINT member_schedule_range CHECK ((schedule_visible_from IS NULL AND schedule_visible_until IS NULL) OR (schedule_visible_from IS NOT NULL AND schedule_visible_until IS NOT NULL AND schedule_visible_from <= schedule_visible_until));
ALTER TABLE public.company_invites ADD CONSTRAINT invite_schedule_range CHECK ((schedule_visible_from IS NULL AND schedule_visible_until IS NULL) OR (schedule_visible_from IS NOT NULL AND schedule_visible_until IS NOT NULL AND schedule_visible_from <= schedule_visible_until));
CREATE OR REPLACE FUNCTION public.validate_crew_access_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NEW.crew_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crews WHERE id=NEW.crew_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Crew must belong to this company'; END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR (TG_TABLE_NAME='company_members' AND to_jsonb(NEW)->>'user_id' IS DISTINCT FROM to_jsonb(OLD)->>'user_id')) THEN RAISE EXCEPTION 'Membership identity cannot change'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER validate_member_crew BEFORE INSERT OR UPDATE ON public.company_members FOR EACH ROW EXECUTE FUNCTION public.validate_crew_access_assignment();
CREATE TRIGGER validate_invite_crew BEFORE INSERT OR UPDATE ON public.company_invites FOR EACH ROW EXECUTE FUNCTION public.validate_crew_access_assignment();
GRANT UPDATE ON public.company_invites TO authenticated;
CREATE POLICY "office updates pending invites" ON public.company_invites FOR UPDATE TO authenticated USING (public.is_office(company_id) AND accepted_at IS NULL) WITH CHECK (public.is_office(company_id) AND role <> 'owner' AND accepted_at IS NULL);
ALTER POLICY "office manages members" ON public.company_members WITH CHECK (public.is_office(company_id) AND role <> 'owner');
CREATE OR REPLACE FUNCTION public.accept_my_invites() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE n integer := 0; r record; my_email text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT email INTO my_email FROM auth.users WHERE id=auth.uid();
 FOR r IN SELECT * FROM public.company_invites WHERE lower(email)=lower(my_email) AND accepted_at IS NULL FOR UPDATE LOOP
 INSERT INTO public.company_members(company_id,user_id,role,crew_id,schedule_visible_from,schedule_visible_until) VALUES(r.company_id,auth.uid(),r.role,r.crew_id,r.schedule_visible_from,r.schedule_visible_until) ON CONFLICT(company_id,user_id) DO NOTHING;
 UPDATE public.company_invites SET accepted_at=now() WHERE id=r.id; n:=n+1;
 END LOOP; RETURN n; END $$;
CREATE OR REPLACE FUNCTION public.can_access_crew_job(_company uuid,_crew uuid,_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT public.is_office(_company) OR EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=_company AND m.user_id=auth.uid() AND m.role IN ('technician','crew_manager') AND m.crew_id=_crew AND _date BETWEEN m.schedule_visible_from AND m.schedule_visible_until)
$$;
CREATE POLICY "restrict job schedule visibility" ON public.jobs AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_access_crew_job(company_id,crew_id,scheduled_date) OR public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.customers c WHERE c.id=jobs.customer_id AND c.portal_user_id=auth.uid()));
ALTER POLICY "manager insert" ON public.jobs WITH CHECK (public.is_manager(company_id) AND public.can_access_crew_job(company_id,crew_id,scheduled_date));
ALTER POLICY "manager update" ON public.jobs USING (public.is_manager(company_id) AND public.can_access_crew_job(company_id,crew_id,scheduled_date)) WITH CHECK (public.is_manager(company_id) AND public.can_access_crew_job(company_id,crew_id,scheduled_date));
ALTER POLICY "manager delete" ON public.jobs USING (public.is_manager(company_id) AND public.can_access_crew_job(company_id,crew_id,scheduled_date));
ALTER POLICY "tech updates jobs" ON public.jobs USING (public.can_access_crew_job(company_id,crew_id,scheduled_date)) WITH CHECK (public.can_access_crew_job(company_id,crew_id,scheduled_date));
CREATE OR REPLACE FUNCTION public.enforce_crew_job_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND public.has_company_role(OLD.company_id,ARRAY['technician']::public.company_role[]) AND (to_jsonb(NEW)-ARRAY['status','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at']) THEN RAISE EXCEPTION 'Field technicians may only update job status'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Job company cannot change'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER enforce_crew_job_update BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_crew_job_update();
CREATE OR REPLACE FUNCTION public.can_access_job_customer(_company uuid,_customer uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_office(_company) OR EXISTS(SELECT 1 FROM public.jobs j WHERE j.company_id=_company AND j.customer_id=_customer AND public.can_access_crew_job(j.company_id,j.crew_id,j.scheduled_date)) $$;
CREATE OR REPLACE FUNCTION public.can_access_job_property(_company uuid,_property uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_office(_company) OR EXISTS(SELECT 1 FROM public.jobs j WHERE j.company_id=_company AND j.property_id=_property AND public.can_access_crew_job(j.company_id,j.crew_id,j.scheduled_date)) $$;
CREATE POLICY "restrict customer crew visibility" ON public.customers AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_access_job_customer(company_id,id) OR portal_user_id=auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "restrict property crew visibility" ON public.properties AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_access_job_property(company_id,id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "restrict recurring crew visibility" ON public.recurring_plans AS RESTRICTIVE FOR SELECT TO authenticated USING(public.is_office(company_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE OR REPLACE FUNCTION public.generate_recurring_jobs(_company uuid,_until date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p record; d date; step interval; n integer:=0; c integer; BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 FOR p IN SELECT * FROM public.recurring_plans WHERE company_id=_company AND active LOOP
 step:=CASE p.frequency WHEN 'weekly' THEN interval '7 days' WHEN 'biweekly' THEN interval '14 days' ELSE interval '1 month' END; d:=p.start_date;
 WHILE d<=least(_until,coalesce(p.end_date,_until)) LOOP
 IF d>=current_date THEN INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,recurring_plan_id,title,scheduled_date,recurrence_date,price) VALUES(p.company_id,p.customer_id,p.property_id,p.crew_id,p.id,p.service,d,d,p.price) ON CONFLICT DO NOTHING; GET DIAGNOSTICS c=ROW_COUNT; n:=n+c; END IF; d:=(d+step)::date;
 END LOOP; END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.can_access_crew_job(uuid,uuid,date),public.can_access_job_customer(uuid,uuid),public.can_access_job_property(uuid,uuid),public.accept_my_invites(),public.generate_recurring_jobs(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_crew_job(uuid,uuid,date),public.can_access_job_customer(uuid,uuid),public.can_access_job_property(uuid,uuid),public.accept_my_invites(),public.generate_recurring_jobs(uuid,date) TO authenticated,service_role;