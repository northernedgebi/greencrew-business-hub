ALTER TABLE public.customers ADD COLUMN billing_frequency text NOT NULL DEFAULT 'manual' CHECK(billing_frequency IN ('manual','monthly')), ADD COLUMN monthly_amount numeric CHECK(monthly_amount>0), ADD COLUMN billing_start date, ADD COLUMN billing_end date, ADD COLUMN billing_timezone text NOT NULL DEFAULT 'America/New_York', ADD COLUMN payment_terms_days integer NOT NULL DEFAULT 30 CHECK(payment_terms_days BETWEEN 0 AND 365), ADD CONSTRAINT billing_window_valid CHECK(billing_end IS NULL OR billing_start IS NULL OR billing_end>=billing_start);
ALTER TABLE public.recurring_plans ADD COLUMN monthly_included boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN monthly_included boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN billing_period date, ADD COLUMN billing_group text, ADD COLUMN billing_kind text;
CREATE UNIQUE INDEX monthly_invoice_unique ON public.invoices(customer_id,billing_period,billing_group) WHERE billing_period IS NOT NULL;
CREATE OR REPLACE FUNCTION public.snapshot_monthly_coverage() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.recurring_plan_id IS NOT NULL THEN SELECT monthly_included INTO NEW.monthly_included FROM public.recurring_plans WHERE id=NEW.recurring_plan_id; END IF; RETURN NEW; END $$;
CREATE TRIGGER snapshot_monthly_coverage BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.snapshot_monthly_coverage();
CREATE OR REPLACE FUNCTION public.validate_monthly_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.billing_timezone) THEN RAISE EXCEPTION 'Choose a valid billing time zone'; END IF; IF NEW.billing_frequency='monthly' AND NEW.billing_start IS NULL THEN RAISE EXCEPTION 'Choose the first billing date'; END IF; IF NEW.monthly_amount IS NOT NULL AND NEW.billing_mode<>'combined' THEN RAISE EXCEPTION 'Fixed monthly amounts require one combined invoice'; END IF; RETURN NEW; END $$;
CREATE TRIGGER validate_monthly_settings BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.validate_monthly_settings();
CREATE OR REPLACE FUNCTION public.generate_customer_monthly_invoice(_customer uuid, _as_of date DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers%ROWTYPE; anchor date; today date; due date; period_end date; inv uuid; group_key text; j record; count_created integer:=0; maxmonth date;
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=_customer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
 IF auth.uid() IS NOT NULL THEN IF NOT public.is_office(c.company_id) THEN RAISE EXCEPTION 'Office access required'; END IF; ELSIF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF c.billing_frequency<>'monthly' OR c.billing_start IS NULL OR c.status<>'active' OR EXISTS(SELECT 1 FROM public.companies WHERE id=c.company_id AND subscription_status='suspended') THEN RETURN 0; END IF;
 today:=coalesce(_as_of,(current_timestamp AT TIME ZONE c.billing_timezone)::date);
 IF today>(current_timestamp AT TIME ZONE c.billing_timezone)::date THEN RAISE EXCEPTION 'Future billing is not available'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c.company_id::text,0));
 anchor:=date_trunc('month',c.billing_start)::date; maxmonth:=date_trunc('month',least(today,coalesce(c.billing_end,today)))::date;
 WHILE anchor<=maxmonth LOOP
 due:=anchor+least(extract(day FROM c.billing_start)::int,extract(day FROM (anchor+interval '1 month - 1 day'))::int)-1;
 period_end:=due;
 IF due>=c.billing_start AND due<=today AND (c.billing_end IS NULL OR due<=c.billing_end) THEN
 IF c.monthly_amount IS NOT NULL THEN
 INSERT INTO public.invoices(company_id,customer_id,status,issue_date,due_date,billing_period,billing_group,billing_kind,notes) VALUES(c.company_id,c.id,'draft',due,due+c.payment_terms_days,anchor,'fixed','fixed_monthly','Fixed monthly service agreement; separately priced extras are billed separately.') ON CONFLICT(customer_id,billing_period,billing_group) WHERE billing_period IS NOT NULL DO NOTHING RETURNING id INTO inv;
 IF inv IS NOT NULL THEN
 INSERT INTO public.invoice_items(company_id,invoice_id,description,quantity,unit_price) VALUES(c.company_id,inv,'Monthly service fee — '||to_char(anchor,'FMMonth YYYY'),1,c.monthly_amount);
 INSERT INTO public.invoice_items(company_id,invoice_id,description,quantity,unit_price) SELECT c.company_id,inv,p.service||' — '||pr.address||' (included)',1,0 FROM public.recurring_plans p JOIN public.properties pr ON pr.id=p.property_id WHERE p.customer_id=c.id AND p.active AND p.monthly_included;
 count_created:=count_created+1;
 END IF;
 ELSE
 FOR group_key IN SELECT DISTINCT CASE WHEN c.billing_mode='combined' THEN 'all' ELSE coalesce(property_id::text,'none') END FROM public.jobs WHERE customer_id=c.id AND company_id=c.company_id AND status='completed' AND invoice_id IS NULL AND NOT monthly_included AND scheduled_date<period_end LOOP
 inv:=NULL;
 INSERT INTO public.invoices(company_id,customer_id,status,issue_date,due_date,billing_period,billing_group,billing_kind) VALUES(c.company_id,c.id,'draft',due,due+c.payment_terms_days,anchor,group_key,'monthly_work') ON CONFLICT(customer_id,billing_period,billing_group) WHERE billing_period IS NOT NULL DO NOTHING RETURNING id INTO inv;
 IF inv IS NOT NULL THEN
 FOR j IN SELECT jobs.*,pr.address FROM public.jobs LEFT JOIN public.properties pr ON pr.id=jobs.property_id WHERE jobs.customer_id=c.id AND jobs.company_id=c.company_id AND jobs.status='completed' AND jobs.invoice_id IS NULL AND NOT jobs.monthly_included AND jobs.scheduled_date<period_end AND (c.billing_mode='combined' OR coalesce(jobs.property_id::text,'none')=group_key) FOR UPDATE OF jobs LOOP
 INSERT INTO public.invoice_items(company_id,invoice_id,job_id,description,quantity,unit_price) VALUES(c.company_id,inv,j.id,j.title||' ('||j.scheduled_date||')'||coalesce(' — '||j.address,''),1,j.price);
 UPDATE public.jobs SET invoice_id=inv WHERE id=j.id;
 END LOOP;
 count_created:=count_created+1;
 END IF;
 END LOOP;
 END IF;
 END IF;
 anchor:=(anchor+interval '1 month')::date;
 END LOOP;
 RETURN count_created;
END $$;
REVOKE ALL ON FUNCTION public.generate_customer_monthly_invoice(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_customer_monthly_invoice(uuid,date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.generate_due_monthly_invoices() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c record; n integer:=0; BEGIN IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Scheduled billing access required'; END IF; FOR c IN SELECT id FROM public.customers WHERE billing_frequency='monthly' AND status='active' LOOP n:=n+public.generate_customer_monthly_invoice(c.id); END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.generate_due_monthly_invoices() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_monthly_invoices() TO service_role;
COMMENT ON COLUMN public.jobs.monthly_included IS 'Coverage snapshot at creation; included work is excluded from per-visit billing without changing its service price.';