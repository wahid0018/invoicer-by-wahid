-- Invoicer starter schema for Supabase/PostgreSQL. Foundation only; not a GST certification.
-- Keep service-role credentials on a trusted server. Never ship them in the desktop app.
create extension if not exists pgcrypto;
create type public.membership_role as enum ('owner','manager','staff','viewer');
create type public.license_plan as enum ('free','monthly','yearly','lifetime');
create type public.invoice_status as enum ('draft','issued','cancelled');
create type public.party_kind as enum ('registered','unregistered','consumer','export','sez','deemed_export');
create type public.supply_kind as enum ('goods','service');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique, mobile text, full_name text,
 platform_role text not null default 'user' check(platform_role in ('user','admin')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.companies (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 name text not null, gstin text, pan text, email text, phone text, address text, city text,
 state_code char(2), pincode text, bank_name text, bank_account_number text, bank_ifsc text,
 bank_branch text, upi_id text, logo_path text, default_terms text, settings jsonb not null default '{}',
 theme_key text not null default 'teal', invoice_prefix text not null default '', invoice_suffix text not null default '',
 next_invoice_number bigint not null default 1 check(next_invoice_number>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.company_members (
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role public.membership_role not null default 'owner', theme_key text,
 created_at timestamptz not null default now(), primary key(company_id,user_id)
);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 plan public.license_plan not null default 'free', status text not null default 'trial'
   check(status in ('trial','active','expired','suspended','cancelled')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 max_companies smallint not null default 2 check(max_companies between 1 and 2),
 invoice_limit integer, created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index subscriptions_user_status_idx on public.subscriptions(user_id,status,ends_at desc);
create table public.license_keys (
 id uuid primary key default gen_random_uuid(), email text not null, key_hash text not null unique,
 plan public.license_plan not null, starts_at timestamptz not null, ends_at timestamptz,
 activated_by uuid references public.profiles(id), activated_at timestamptz, revoked_at timestamptz,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.units (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, symbol text, parent_unit_id uuid references public.units(id), conversion_rate numeric(18,6),
 decimals smallint not null default 2 check(decimals between 0 and 6), created_at timestamptz not null default now(),
 unique(company_id,name)
);
create table public.agents (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, mobile text, email text, address text, city text, commission_percent numeric(8,4) not null default 0,
 archived_at timestamptz, created_at timestamptz not null default now(), unique(company_id,id)
);
create table public.parties (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, gstin text, state_code char(2), party_type public.party_kind not null default 'unregistered',
 email text, mobile text, billing_address text, city text, pincode text,
 fixed_discount numeric(8,4) not null default 0, credit_limit_amount numeric(14,2), credit_days integer,
 agent_id uuid, notes text, archived_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(company_id,id),
 foreign key(company_id,agent_id) references public.agents(company_id,id)
);
create index parties_company_name_idx on public.parties(company_id,lower(name)) where archived_at is null;
create index parties_company_gstin_idx on public.parties(company_id,gstin) where gstin is not null;
create table public.party_shipping_addresses (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 party_id uuid not null references public.parties(id) on delete cascade, label text, address text not null,
 city text, state_code char(2), pincode text, contact_name text, mobile text,
 is_default boolean not null default false, created_at timestamptz not null default now()
);
create table public.transports (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, gstin text, contact_person text, address text, mobile text, created_at timestamptz not null default now()
);
create table public.items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, item_code text, hsn_sac text, supply_type public.supply_kind not null default 'goods',
 sale_rate numeric(14,4) not null default 0, gst_rate numeric(5,2) not null default 0,
 unit_id uuid references public.units(id), alternate_unit_id uuid references public.units(id), conversion_rate numeric(18,6),
 decimals smallint not null default 2 check(decimals between 0 and 6), details text, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,id)
);
create unique index items_company_code_unique on public.items(company_id,item_code) where item_code is not null;
create table public.item_barcodes (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 item_id uuid not null references public.items(id) on delete cascade, barcode text not null, unique(company_id,barcode)
);
create table public.party_item_rates (
 company_id uuid not null references public.companies(id) on delete cascade,
 party_id uuid not null references public.parties(id) on delete cascade,
 item_id uuid not null references public.items(id) on delete cascade,
 last_rate numeric(14,4) not null, last_invoice_date date, primary key(company_id,party_id,item_id)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 party_id uuid references public.parties(id), invoice_number text not null, invoice_date date not null,
 status public.invoice_status not null default 'draft', supply_state_code char(2), is_interstate boolean not null default false,
 place_of_supply_code char(2), billing_snapshot jsonb not null default '{}', shipping_snapshot jsonb not null default '{}',
 transport_snapshot jsonb not null default '{}', agent_id uuid references public.agents(id), customer_order_number text,
 delivery_note text, dispatch_document text, dispatched_through text, destination text, lr_number text,
 vehicle_number text, ewaybill_number text, bundles numeric(12,3), notes text, terms text,
 taxable_total numeric(14,2) not null default 0, cgst_total numeric(14,2) not null default 0,
 sgst_total numeric(14,2) not null default 0, igst_total numeric(14,2) not null default 0,
 cess_total numeric(14,2) not null default 0, expense_before_tax numeric(14,2) not null default 0,
 expense_after_tax numeric(14,2) not null default 0, round_off numeric(14,2) not null default 0,
 grand_total numeric(14,2) not null default 0, paid_total numeric(14,2) not null default 0,
 deduction_total numeric(14,2) not null default 0, commission_percent numeric(8,4) not null default 0,
 commission_amount numeric(14,2) not null default 0, version integer not null default 1,
 client_mutation_id uuid, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,invoice_number), unique(company_id,client_mutation_id)
);
create index invoices_company_date_idx on public.invoices(company_id,invoice_date desc);
create index invoices_company_party_idx on public.invoices(company_id,party_id,invoice_date desc);
create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade, line_number integer not null,
 item_id uuid references public.items(id), description text not null, hsn_sac text, unit_label text,
 quantity numeric(18,6) not null default 0, rate numeric(14,4) not null default 0,
 discount_percent numeric(8,4) not null default 0, discount_amount numeric(14,2) not null default 0,
 taxable_value numeric(14,2) not null default 0, gst_rate numeric(5,2) not null default 0,
 cgst_amount numeric(14,2) not null default 0, sgst_amount numeric(14,2) not null default 0,
 igst_amount numeric(14,2) not null default 0, cess_amount numeric(14,2) not null default 0,
 total_amount numeric(14,2) not null default 0, extra_details text, created_at timestamptz not null default now(),
 unique(invoice_id,line_number)
);
create table public.invoice_expenses (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade, label text not null,
 placement text not null check(placement in ('before_tax','after_tax')),
 calculation_mode text not null check(calculation_mode in ('amount','percent','on_quantity')),
 input_value numeric(14,4) not null default 0, calculated_amount numeric(14,2) not null default 0,
 taxable boolean not null default false, gst_rate numeric(5,2) not null default 0
);
create table public.invoice_payments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade, paid_at date not null default current_date,
 amount numeric(14,2) not null check(amount>=0), deduction numeric(14,2) not null default 0,
 method text, reference text, note text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.agent_commission_payments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 agent_id uuid not null references public.agents(id), invoice_id uuid references public.invoices(id),
 paid_at date not null default current_date, amount numeric(14,2) not null check(amount>=0),
 deduction numeric(14,2) not null default 0, note text, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.sync_mutations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 actor_id uuid not null references public.profiles(id), client_mutation_id uuid not null,
 entity_type text not null, entity_id uuid, operation text not null check(operation in ('upsert','delete')),
 base_version integer, payload jsonb not null, created_at timestamptz not null default now(), synced_at timestamptz,
 unique(company_id,actor_id,client_mutation_id)
);

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.platform_role='admin');
$$;
create or replace function public.has_company_access(target_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(select 1 from public.company_members m
   where m.company_id=target_company and m.user_id=auth.uid());
$$;
create or replace function public.has_company_role(target_company uuid, allowed_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.company_members m
   where m.company_id=target_company and m.user_id=auth.uid() and m.role=any(allowed_roles));
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
revoke all on function public.has_company_access(uuid) from public;
grant execute on function public.has_company_access(uuid) to authenticated;
revoke all on function public.has_company_role(uuid,public.membership_role[]) from public;
grant execute on function public.has_company_role(uuid,public.membership_role[]) to authenticated;

-- Account bootstrap. Platform role is intentionally not copied from auth metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''));
 insert into public.subscriptions(user_id,plan,status,max_companies,invoice_limit) values(new.id,'free','trial',2,2);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Shared company_id policy across all tenant-owned tables.
do $$ declare t text;
begin
 foreach t in array array['units','parties','party_shipping_addresses','agents','transports','items','item_barcodes','party_item_rates','invoices','invoice_lines','invoice_expenses','invoice_payments','agent_commission_payments','sync_mutations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy tenant_select on public.%I for select to authenticated using (public.has_company_access(company_id))',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''owner'',''manager'',''staff'']::public.membership_role[]))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using (public.has_company_role(company_id, array[''owner'',''manager'',''staff'']::public.membership_role[])) with check (public.has_company_role(company_id, array[''owner'',''manager'',''staff'']::public.membership_role[]))',t);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using (public.has_company_role(company_id, array[''owner'',''manager'']::public.membership_role[]))',t);
 end loop;
end $$;
alter table public.company_members enable row level security;
create policy company_members_select on public.company_members for select to authenticated
 using(user_id=auth.uid() or public.has_company_access(company_id));
create policy company_members_insert on public.company_members for insert to authenticated
 with check(public.has_company_role(company_id,array['owner']::public.membership_role[]) and user_id<>auth.uid() and role<>'owner');
create policy company_members_update on public.company_members for update to authenticated
 using(public.has_company_role(company_id,array['owner']::public.membership_role[]) and user_id<>auth.uid())
 with check(public.has_company_role(company_id,array['owner']::public.membership_role[]) and user_id<>auth.uid() and role<>'owner');
create policy company_members_delete on public.company_members for delete to authenticated
 using(public.has_company_role(company_id,array['owner']::public.membership_role[]) and user_id<>auth.uid());
alter table public.companies enable row level security;
create policy company_select on public.companies for select to authenticated using(public.has_company_access(id));
create policy company_insert on public.companies for insert to authenticated with check(created_by=auth.uid());
create policy company_update on public.companies for update to authenticated using(public.has_company_role(id,array['owner','manager']::public.membership_role[])) with check(public.has_company_role(id,array['owner','manager']::public.membership_role[]));
create policy company_delete on public.companies for delete to authenticated using(public.has_company_role(id,array['owner']::public.membership_role[]));
alter table public.profiles enable row level security;
create policy profile_self_or_admin_select on public.profiles for select to authenticated using(id=auth.uid() or public.is_platform_admin());
create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and platform_role='user');
alter table public.subscriptions enable row level security;
create policy subscriptions_self_select on public.subscriptions for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
alter table public.license_keys enable row level security;
create policy license_keys_self_select on public.license_keys for select to authenticated using(lower(email)=lower((select email from public.profiles where id=auth.uid())) or public.is_platform_admin());

-- Before production: protect admin/profile/license mutations with audited Edge Functions;
-- enforce company limit and 2-invoice free tier transactionally; issue invoices through an
-- RPC that locks the number sequence and recalculates tax; add update/delete RLS policies
-- constrained by role. Do not use browser-computed totals as the accounting source of truth.
