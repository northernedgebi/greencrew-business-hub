
-- ENUMS
create type public.app_role as enum ('super_admin');
create type public.company_role as enum ('owner','office_manager','crew_manager','technician');
create type public.job_status as enum ('scheduled','in_progress','completed','cancelled');
create type public.invoice_status as enum ('draft','sent','paid','partial','void','overdue');
create type public.recurrence as enum ('weekly','biweekly','monthly');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- PLATFORM ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));

-- COMPANIES
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text, address text,
  plan text not null default 'starter',
  subscription_status text not null default 'trialing',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, update on public.companies to authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  role company_role not null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
grant select, insert, update, delete on public.company_members to authenticated;
grant all on public.company_members to service_role;
alter table public.company_members enable row level security;

create or replace function public.is_member(_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members where company_id = _company and user_id = auth.uid())
$$;
create or replace function public.has_company_role(_company uuid, _roles company_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members where company_id = _company and user_id = auth.uid() and role = any(_roles))
$$;
-- office staff = owner + office manager
create or replace function public.is_office(_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, array['owner','office_manager']::company_role[])
$$;
create or replace function public.is_manager(_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, array['owner','office_manager','crew_manager']::company_role[])
$$;

create policy "members read company" on public.companies for select to authenticated using (public.is_member(id) or public.has_role(auth.uid(),'super_admin'));
create policy "owner updates company" on public.companies for update to authenticated using (public.has_company_role(id, array['owner']::company_role[]) or public.has_role(auth.uid(),'super_admin'));

create policy "members read members" on public.company_members for select to authenticated using (public.is_member(company_id) or public.has_role(auth.uid(),'super_admin'));
create policy "office manages members" on public.company_members for update to authenticated using (public.is_office(company_id) and role <> 'owner');
create policy "office removes members" on public.company_members for delete to authenticated using (public.is_office(company_id) and role <> 'owner');

create policy "profile self" on public.profiles for select to authenticated using (
  id = auth.uid() or public.has_role(auth.uid(),'super_admin') or exists (
    select 1 from public.company_members a join public.company_members b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "profile insert self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profile update self" on public.profiles for update to authenticated using (id = auth.uid());

-- INVITES
create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role company_role not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.company_invites to authenticated;
grant all on public.company_invites to service_role;
alter table public.company_invites enable row level security;
create policy "office reads invites" on public.company_invites for select to authenticated using (public.is_office(company_id) or lower(email) = lower(auth.jwt()->>'email'));
create policy "office creates invites" on public.company_invites for insert to authenticated with check (public.is_office(company_id) and role <> 'owner');
create policy "office deletes invites" on public.company_invites for delete to authenticated using (public.is_office(company_id));

-- signup trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RPC: create company
create or replace function public.create_company(_name text, _phone text default null, _plan text default 'starter')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(_name)) < 2 then raise exception 'Company name required'; end if;
  insert into public.companies (name, phone, plan, created_by) values (trim(_name), _phone, coalesce(_plan,'starter'), auth.uid()) returning id into cid;
  insert into public.company_members (company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

-- RPC: accept invites matching my email
create or replace function public.accept_my_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  for r in select * from public.company_invites where lower(email) = lower(my_email) and accepted_at is null loop
    insert into public.company_members (company_id, user_id, role) values (r.company_id, auth.uid(), r.role) on conflict (company_id, user_id) do nothing;
    update public.company_invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- CUSTOMERS
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text, phone text, notes text,
  status text not null default 'active',
  portal_user_id uuid,
  created_at timestamptz not null default now()
);
create index on public.customers(company_id);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text, address text not null, city text, state text, zip text,
  lot_size_sqft integer, gate_code text, notes text,
  lat double precision, lng double precision,
  created_at timestamptz not null default now()
);
create index on public.properties(company_id);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, color text default 'green',
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  name text not null, email text, phone text, title text,
  hourly_rate numeric(10,2), crew_id uuid references public.crews(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.recurring_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  crew_id uuid references public.crews(id) on delete set null,
  service text not null, frequency recurrence not null default 'weekly',
  price numeric(10,2) not null default 0,
  start_date date not null default current_date, end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  crew_id uuid references public.crews(id) on delete set null,
  recurring_plan_id uuid references public.recurring_plans(id) on delete set null,
  title text not null, notes text,
  scheduled_date date not null, start_time time,
  status job_status not null default 'scheduled',
  price numeric(10,2) not null default 0,
  completed_at timestamptz,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  unique (recurring_plan_id, scheduled_date)
);
create index on public.jobs(company_id, scheduled_date);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  number integer not null,
  status invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + 30),
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  total numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (company_id, number)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null, quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0, job_id uuid
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null default 'card',
  paid_at timestamptz not null default now(),
  note text
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  title text not null, status text not null default 'draft',
  total numeric(10,2) not null default 0, notes text,
  valid_until date, created_at timestamptz not null default now()
);
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null, body text, status text not null default 'draft',
  signed_at timestamptz, start_date date, end_date date,
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sender_id uuid, direction text not null default 'outbound', channel text not null default 'note',
  body text not null, created_at timestamptz not null default now()
);

-- GRANTS + RLS for tenant tables
do $$
declare t text;
begin
  foreach t in array array['customers','properties','crews','employees','recurring_plans','jobs','invoices','invoice_items','payments','estimates','contracts','messages'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member(company_id) or public.has_role(auth.uid(),''super_admin''))', t);
  end loop;
  -- office-managed tables
  foreach t in array array['customers','properties','recurring_plans','invoices','invoice_items','payments','estimates','contracts'] loop
    execute format('create policy "office insert" on public.%I for insert to authenticated with check (public.is_office(company_id))', t);
    execute format('create policy "office update" on public.%I for update to authenticated using (public.is_office(company_id))', t);
    execute format('create policy "office delete" on public.%I for delete to authenticated using (public.is_office(company_id))', t);
  end loop;
  -- manager-managed tables
  foreach t in array array['crews','employees','jobs'] loop
    execute format('create policy "manager insert" on public.%I for insert to authenticated with check (public.is_manager(company_id))', t);
    execute format('create policy "manager update" on public.%I for update to authenticated using (public.is_manager(company_id))', t);
    execute format('create policy "manager delete" on public.%I for delete to authenticated using (public.is_manager(company_id))', t);
  end loop;
end $$;
create policy "members message" on public.messages for insert to authenticated with check (public.is_member(company_id));
-- technicians can update job status
create policy "tech updates jobs" on public.jobs for update to authenticated using (public.is_member(company_id));

-- customer portal read access
create policy "portal customer self" on public.customers for select to authenticated using (portal_user_id = auth.uid());
create policy "portal jobs" on public.jobs for select to authenticated using (exists (select 1 from public.customers c where c.id = customer_id and c.portal_user_id = auth.uid()));
create policy "portal invoices" on public.invoices for select to authenticated using (exists (select 1 from public.customers c where c.id = customer_id and c.portal_user_id = auth.uid()));

-- Invoice number + totals
create or replace function public.set_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number),1000) + 1 into new.number from public.invoices where company_id = new.company_id;
  end if;
  return new;
end $$;
create trigger trg_invoice_number before insert on public.invoices for each row execute function public.set_invoice_number();
alter table public.invoices alter column number set default 0;

create or replace function public.recalc_invoice(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare sub numeric; paid numeric; inv record;
begin
  select * into inv from public.invoices where id = _id;
  if not found then return; end if;
  select coalesce(sum(quantity*unit_price),0) into sub from public.invoice_items where invoice_id = _id;
  select coalesce(sum(amount),0) into paid from public.payments where invoice_id = _id;
  update public.invoices set subtotal = sub,
    total = round(sub * (1 + tax_rate/100), 2),
    amount_paid = paid,
    status = case when status = 'void' then 'void'
                  when paid >= round(sub*(1+tax_rate/100),2) and sub > 0 then 'paid'
                  when paid > 0 then 'partial'
                  when status in ('paid','partial') then 'sent'
                  else status end
  where id = _id;
end $$;
create or replace function public.trg_recalc_items() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id)); return null; end $$;
create trigger trg_items_recalc after insert or update or delete on public.invoice_items for each row execute function public.trg_recalc_items();
create trigger trg_payments_recalc after insert or update or delete on public.payments for each row execute function public.trg_recalc_items();

-- Generate jobs from recurring plans for a date window
create or replace function public.generate_recurring_jobs(_company uuid, _until date)
returns integer language plpgsql security definer set search_path = public as $$
declare p record; d date; step interval; n integer := 0; c integer;
begin
  if not public.is_manager(_company) then raise exception 'Forbidden'; end if;
  for p in select * from public.recurring_plans where company_id = _company and active loop
    step := case p.frequency when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end;
    d := p.start_date;
    while d <= least(_until, coalesce(p.end_date, _until)) loop
      if d >= current_date then
        insert into public.jobs (company_id, customer_id, property_id, crew_id, recurring_plan_id, title, scheduled_date, price)
        values (p.company_id, p.customer_id, p.property_id, p.crew_id, p.id, p.service, d, p.price)
        on conflict (recurring_plan_id, scheduled_date) do nothing;
        get diagnostics c = row_count; n := n + c;
      end if;
      d := (d + step)::date;
    end loop;
  end loop;
  return n;
end $$;
