ALTER TABLE public.customers ADD COLUMN customer_type text NOT NULL DEFAULT 'residential';
ALTER TABLE public.customers ADD CONSTRAINT customers_customer_type_check CHECK (customer_type IN ('residential','commercial'));
ALTER TABLE public.customers ADD COLUMN ein text;
CREATE OR REPLACE FUNCTION public.create_customer_with_service(_company uuid,_customer jsonb,_property jsonb,_service jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; pid uuid;
BEGIN
 IF NOT public.is_office(_company) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF coalesce(trim(_customer->>'name'),'')='' OR coalesce(trim(_property->>'address'),'')='' THEN RAISE EXCEPTION 'Customer name and service address required'; END IF;
 IF coalesce(_customer->>'customer_type','residential') NOT IN ('residential','commercial') THEN RAISE EXCEPTION 'Customer type must be residential or commercial'; END IF;
 INSERT INTO public.customers(company_id,name,email,phone,customer_type,ein) VALUES(_company,trim(_customer->>'name'),nullif(_customer->>'email',''),nullif(_customer->>'phone',''),coalesce(_customer->>'customer_type','residential'),nullif(trim(_customer->>'ein'),'')) RETURNING id INTO cid;
 INSERT INTO public.properties(company_id,customer_id,address,city,state,zip,gate_code) VALUES(_company,cid,trim(_property->>'address'),nullif(_property->>'city',''),nullif(_property->>'state',''),nullif(_property->>'zip',''),nullif(trim(_property->>'gate_code'),'')) RETURNING id INTO pid;
 PERFORM public.add_customer_service(_company,cid,_service||jsonb_build_object('property_id',pid));
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_with_service(uuid,jsonb,jsonb,jsonb) TO authenticated;