CREATE TABLE public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  product_id text,
  price_id text not null,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  environment text not null default 'sandbox',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX idx_company_subscriptions_company ON public.company_subscriptions(company_id, environment, created_at desc);
GRANT SELECT ON public.company_subscriptions TO authenticated;
GRANT ALL ON public.company_subscriptions TO service_role;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read company subscriptions" ON public.company_subscriptions FOR SELECT TO authenticated
  USING (public.has_company_role(company_id, ARRAY['owner']::company_role[]) OR public.has_role(auth.uid(), 'super_admin'));