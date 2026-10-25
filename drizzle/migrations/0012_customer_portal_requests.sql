ALTER TABLE public.companies ADD COLUMN booking_weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5}', ADD COLUMN max_visits_per_day integer NOT NULL DEFAULT 20;

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reschedule','service')),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  requested_date date,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','quoted','approved','declined','scheduled','cancelled')),
  company_reply text,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  scheduled_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "office or own customer reads" ON public.service_requests FOR SELECT TO authenticated
  USING (public.can_read_company(company_id) OR public.has_role(auth.uid(),'super_admin')
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "office updates" ON public.service_requests FOR UPDATE TO authenticated USING (public.is_office(company_id)) WITH CHECK (public.is_office(company_id));
CREATE POLICY "office deletes" ON public.service_requests FOR DELETE TO authenticated USING (public.is_office(company_id));

-- Portal: payments and quotes visible to the customer they belong to.
CREATE POLICY "portal payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id WHERE i.id = invoice_id AND c.portal_user_id = auth.uid()));
DROP POLICY IF EXISTS "restrict estimate visibility" ON public.estimates;
CREATE POLICY "restrict estimate visibility" ON public.estimates AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.can_read_company(company_id) OR public.has_role(auth.uid(),'super_admin')
    OR (status <> 'draft' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid())));
CREATE POLICY "portal estimates" ON public.estimates FOR SELECT TO authenticated
  USING (status <> 'draft' AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));

-- Link signed-in user to customer records with the same email.
CREATE OR REPLACE FUNCTION public.link_my_customer_accounts() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _email text; _n integer;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN 0; END IF;
  UPDATE public.customers SET portal_user_id = auth.uid() WHERE portal_user_id IS NULL AND lower(email) = _email;
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.portal_available_days(_job uuid, _from date, _to date) RETURNS SETOF date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d::date FROM public.jobs j
  JOIN public.customers c ON c.id = j.customer_id AND c.portal_user_id = auth.uid()
  JOIN public.companies co ON co.id = j.company_id
  CROSS JOIN generate_series(greatest(_from, current_date + 1), least(_to, current_date + 60), interval '1 day') d
  WHERE j.id = _job
    AND extract(dow FROM d)::int = ANY (co.booking_weekdays)
    AND d::date <> j.scheduled_date
    AND (SELECT count(*) FROM public.jobs x WHERE x.company_id = j.company_id AND x.scheduled_date = d::date AND x.status <> 'cancelled'
         AND (j.crew_id IS NULL OR x.crew_id = j.crew_id)) < co.max_visits_per_day
$$;

CREATE OR REPLACE FUNCTION public.portal_request_reschedule(_job uuid, _date date, _message text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _j record; _id uuid;
BEGIN
  SELECT j.* INTO _j FROM public.jobs j JOIN public.customers c ON c.id = j.customer_id AND c.portal_user_id = auth.uid() WHERE j.id = _job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF _j.status <> 'scheduled' THEN RAISE EXCEPTION 'Only upcoming visits can be moved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_available_days(_job, _date, _date) d WHERE d = _date) THEN RAISE EXCEPTION 'That day is not available'; END IF;
  IF EXISTS (SELECT 1 FROM public.service_requests WHERE job_id = _job AND status = 'pending') THEN RAISE EXCEPTION 'A move request for this visit is already waiting for approval'; END IF;
  INSERT INTO public.service_requests (company_id, customer_id, kind, job_id, requested_date, message)
  VALUES (_j.company_id, _j.customer_id, 'reschedule', _job, _date, left(nullif(trim(_message), ''), 1000)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.portal_request_service(_customer uuid, _message text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c record; _id uuid;
BEGIN
  SELECT * INTO _c FROM public.customers WHERE id = _customer AND portal_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF coalesce(trim(_message), '') = '' THEN RAISE EXCEPTION 'Please write a note'; END IF;
  INSERT INTO public.service_requests (company_id, customer_id, kind, message) VALUES (_c.company_id, _c.id, 'service', left(trim(_message), 2000)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.portal_cancel_request(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.service_requests r SET status = 'cancelled', updated_at = now()
  FROM public.customers c WHERE r.id = _id AND c.id = r.customer_id AND c.portal_user_id = auth.uid() AND r.status IN ('pending','quoted');
  IF NOT FOUND THEN RAISE EXCEPTION 'Request can no longer be cancelled'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.portal_respond_estimate(_estimate uuid, _accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.estimates e SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END
  FROM public.customers c WHERE e.id = _estimate AND c.id = e.customer_id AND c.portal_user_id = auth.uid() AND e.status = 'sent';
  IF NOT FOUND THEN RAISE EXCEPTION 'This quote is no longer open'; END IF;
  UPDATE public.service_requests SET status = CASE WHEN _accept THEN 'approved' ELSE 'declined' END, updated_at = now()
  WHERE estimate_id = _estimate AND status = 'quoted';
END $$;

REVOKE ALL ON FUNCTION public.link_my_customer_accounts(), public.portal_available_days(uuid,date,date), public.portal_request_reschedule(uuid,date,text), public.portal_request_service(uuid,text), public.portal_cancel_request(uuid), public.portal_respond_estimate(uuid,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.link_my_customer_accounts(), public.portal_available_days(uuid,date,date), public.portal_request_reschedule(uuid,date,text), public.portal_request_service(uuid,text), public.portal_cancel_request(uuid), public.portal_respond_estimate(uuid,boolean) TO authenticated;