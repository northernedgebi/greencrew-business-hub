CREATE OR REPLACE FUNCTION public.is_member_any(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (select 1 from public.company_members where company_id = _company and user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_member(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (select 1 from public.company_members m join public.companies c on c.id = m.company_id
    where m.company_id = _company and m.user_id = auth.uid() and c.subscription_status <> 'suspended')
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_company uuid, _roles company_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (select 1 from public.company_members m join public.companies c on c.id = m.company_id
    where m.company_id = _company and m.user_id = auth.uid() and m.role = any(_roles) and c.subscription_status <> 'suspended')
$$;

DROP POLICY IF EXISTS "members read company" ON public.companies;
CREATE POLICY "members read company" ON public.companies FOR SELECT TO authenticated
  USING (public.is_member_any(id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.protect_company_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') AND auth.uid() IS NOT NULL THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      RAISE EXCEPTION 'Only platform administrators can change subscription status or trial dates';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_company_billing ON public.companies;
CREATE TRIGGER protect_company_billing BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.protect_company_billing();