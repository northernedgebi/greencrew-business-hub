CREATE OR REPLACE FUNCTION public.company_branding(_company uuid) RETURNS TABLE(id uuid,name text,logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT c.id,c.name,c.logo_url FROM public.companies c WHERE c.id=_company AND c.subscription_status<>'suspended' $$;
REVOKE ALL ON FUNCTION public.company_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_branding(uuid) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_current_company_logo(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.companies WHERE logo_url=_path AND subscription_status<>'suspended') $$;
REVOKE ALL ON FUNCTION public.is_current_company_logo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_company_logo(text) TO anon,authenticated;
CREATE POLICY "current company branding logo readable" ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='company-logos' AND public.is_current_company_logo(name));