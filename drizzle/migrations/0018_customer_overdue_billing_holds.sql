ALTER TABLE public.customers ADD COLUMN inactive_reason text, ADD COLUMN overdue_hold_limit numeric;
ALTER TABLE public.customers ADD CONSTRAINT customer_overdue_limit_valid CHECK (overdue_hold_limit IS NULL OR (overdue_hold_limit >= 0 AND overdue_hold_limit::text NOT IN ('NaN','Infinity','-Infinity')));
UPDATE public.customers SET inactive_reason='Inactive' WHERE status<>'active';
CREATE OR REPLACE FUNCTION public.customer_account_state(_customer uuid)
RETURNS TABLE(effective_status text, inactivity_reason text, overdue_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; owed numeric;
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=_customer;
 IF NOT FOUND THEN RETURN; END IF;
 IF auth.uid() IS NOT NULL AND NOT (public.can_read_company(c.company_id) OR public.can_access_job_customer(c.company_id,c.id) OR c.portal_user_id=auth.uid() OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(sum(greatest(total-amount_paid,0)),0) INTO owed FROM public.invoices WHERE customer_id=c.id AND company_id=c.company_id AND status NOT IN ('draft','void') AND due_date<current_date;
 RETURN QUERY SELECT CASE WHEN c.status<>'active' THEN 'inactive' WHEN owed>coalesce(c.overdue_hold_limit,0) THEN 'on_hold' ELSE 'active' END,
 CASE WHEN c.status<>'active' THEN coalesce(nullif(c.inactive_reason,''),'Inactive') WHEN owed>coalesce(c.overdue_hold_limit,0) THEN 'Billing: overdue invoices' ELSE NULL::text END, owed;
END $$;
REVOKE ALL ON FUNCTION public.customer_account_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_account_state(uuid) TO authenticated,service_role;
CREATE VIEW public.customer_accounts WITH (security_invoker=true) AS SELECT c.*, a.effective_status,a.inactivity_reason,a.overdue_balance FROM public.customers c CROSS JOIN LATERAL public.customer_account_state(c.id) a;
GRANT SELECT ON public.customer_accounts TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.enforce_customer_service_hold() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state text;
BEGIN
 IF TG_OP='INSERT' OR (NEW.status IN ('in_progress','completed') AND NEW.status IS DISTINCT FROM OLD.status) OR (NEW.status='scheduled' AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.crew_id IS DISTINCT FROM OLD.crew_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR OLD.status='cancelled')) THEN
 SELECT effective_status INTO state FROM public.customer_account_state(NEW.customer_id);
 IF state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Customer is on hold or inactive. Review their billing and customer status before scheduling or starting work.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_customer_service_hold BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_service_hold();
CREATE OR REPLACE FUNCTION public.generate_service_visits(_plan uuid, _until date, _today date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; d date; k integer:=0; n integer:=0; c integer; state text;
BEGIN
 SELECT * INTO p FROM public.recurring_plans WHERE id=_plan;
 IF NOT FOUND OR NOT public.is_office(p.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _today IS NULL OR abs(_today-current_date)>1 THEN RAISE EXCEPTION 'Invalid local calendar date'; END IF;
 SELECT effective_status INTO state FROM public.customer_account_state(p.customer_id);
 IF NOT p.active OR state IS DISTINCT FROM 'active' THEN RETURN 0; END IF;
 IF _until > _today + 730 THEN RAISE EXCEPTION 'Choose a date within two years'; END IF;
 LOOP
 d:=CASE p.frequency WHEN 'weekly' THEN p.start_date+k*7 WHEN 'biweekly' THEN p.start_date+k*14 WHEN 'yearly' THEN (p.start_date+make_interval(years=>k))::date ELSE (p.start_date+make_interval(months=>k))::date END;
 EXIT WHEN d>least(_until,coalesce(p.end_date,_until));
 IF d>=_today THEN
 INSERT INTO public.jobs(company_id,customer_id,property_id,crew_id,recurring_plan_id,title,scheduled_date,recurrence_date,price,service_kind) VALUES(p.company_id,p.customer_id,p.property_id,p.crew_id,p.id,p.service,d,d,p.price,p.service_kind) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
 END IF;
 k:=k+1;
 END LOOP;
 RETURN n;
END $$;