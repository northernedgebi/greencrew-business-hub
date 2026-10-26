ALTER TABLE public.customers ADD COLUMN billing_mode text NOT NULL DEFAULT 'combined';
ALTER TABLE public.customers ADD CONSTRAINT customers_billing_mode_check CHECK (billing_mode IN ('combined','per_property'));
COMMENT ON COLUMN public.customers.billing_mode IS 'combined = one invoice per billing run with per-address breakouts; per_property = a separate invoice for each service address';