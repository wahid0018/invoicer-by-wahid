-- Apply after outputs/supabase_schema.sql. Client data uses the existing company
-- membership model; this table is a compatibility bridge for the current UI's
-- company-scoped browser store while normalized RPCs are migrated incrementally.
create table if not exists public.company_records (
  company_id uuid not null references public.companies(id) on delete cascade,
  record_key text not null check (length(record_key) between 1 and 160),
  record_value text not null,
  version bigint not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (company_id, record_key)
);

alter table public.company_records enable row level security;
create or replace function public.has_company_role(target_company uuid, allowed_roles public.membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.company_members m
    where m.company_id = target_company and m.user_id = auth.uid() and m.role = any(allowed_roles));
$$;
revoke all on function public.has_company_role(uuid, public.membership_role[]) from public, anon;
grant execute on function public.has_company_role(uuid, public.membership_role[]) to authenticated;
create policy company_records_select on public.company_records
  for select to authenticated using (public.has_company_access(company_id));
create policy company_records_insert on public.company_records
  for insert to authenticated with check (public.has_company_role(company_id, array['owner','manager','staff']::public.membership_role[]) and updated_by = auth.uid());
create policy company_records_update on public.company_records
  for update to authenticated using (public.has_company_role(company_id, array['owner','manager','staff']::public.membership_role[]))
  with check (public.has_company_role(company_id, array['owner','manager','staff']::public.membership_role[]) and updated_by = auth.uid());
create policy company_records_delete on public.company_records
  for delete to authenticated using (public.has_company_role(company_id, array['owner','manager']::public.membership_role[]));

grant select, insert, update, delete on public.company_records to authenticated;

-- Supabase Realtime only emits table changes when the table is in this
-- publication. Keep this migration safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'company_records'
  ) then
    alter publication supabase_realtime add table public.company_records;
  end if;
end $$;

-- Compare-and-swap prevents one desktop/browser from silently overwriting a
-- company record saved from another device. Clients retry only after reloading.
create or replace function public.save_company_record(
  target_company uuid,
  target_key text,
  target_value text,
  expected_version bigint
) returns bigint
language plpgsql security invoker set search_path = public as $$
declare saved_version bigint;
begin
  if length(target_key) not between 1 and 160 then
    raise exception 'Invalid company record key' using errcode = '22023';
  end if;
  insert into public.company_records(company_id, record_key, record_value, version, updated_by, updated_at)
  values (target_company, target_key, target_value, 1, auth.uid(), now())
  on conflict (company_id, record_key) do update
    set record_value = excluded.record_value,
        version = public.company_records.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where public.company_records.version = expected_version
  returning version into saved_version;

  if saved_version is null then
    raise exception 'Company record changed on another device; reload before saving.' using errcode = '40001';
  end if;
  return saved_version;
end;
$$;
revoke all on function public.save_company_record(uuid, text, text, bigint) from public, anon;
grant execute on function public.save_company_record(uuid, text, text, bigint) to authenticated;

create or replace function public.create_company_for_current_user(target_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare company_limit integer; company_count integer; new_company uuid; clean_name text;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a company.' using errcode = '42501'; end if;
  clean_name := trim(coalesce(target_name, ''));
  if length(clean_name) not between 1 and 120 then raise exception 'Enter a company name.' using errcode = '22023'; end if;
  select s.max_companies into company_limit from public.subscriptions s
    where s.user_id = auth.uid() and (s.ends_at is null or s.ends_at > now())
    order by s.created_at desc limit 1;
  company_limit := coalesce(company_limit, 2);
  select count(*) into company_count from public.company_members m where m.user_id = auth.uid();
  if company_count >= company_limit then raise exception 'Your plan has reached its company limit.' using errcode = 'P0001'; end if;
  insert into public.companies(created_by, name) values(auth.uid(), clean_name) returning id into new_company;
  insert into public.company_members(company_id, user_id, role) values(new_company, auth.uid(), 'owner');
  return new_company;
end;
$$;
revoke all on function public.create_company_for_current_user(text) from public, anon;
grant execute on function public.create_company_for_current_user(text) to authenticated;

-- New Supabase users receive a profile, free subscription, and their first
-- company in the same trusted Auth transaction. No service-role key is needed
-- in either the web app or Electron client.
alter table public.profiles add column if not exists address text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare new_company uuid;
begin
  insert into public.profiles(id, email, full_name, mobile, address)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'mobile', ''),
    nullif(new.raw_user_meta_data->>'address', '')
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.subscriptions(user_id, plan, status, max_companies, invoice_limit)
  values (new.id, 'free', 'trial', 2, null)
  on conflict do nothing;

  insert into public.companies(created_by, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'My Company'))
  returning id into new_company;

  insert into public.company_members(company_id, user_id, role)
  values (new_company, new.id, 'owner');
  return new;
end;
$$;

-- Bring already-created Auth users onto the first-company path as well.
do $$
declare account record; new_company uuid;
begin
  for account in select p.id, p.full_name from public.profiles p
    where not exists(select 1 from public.company_members m where m.user_id = p.id)
  loop
    insert into public.companies(created_by, name)
    values (account.id, coalesce(nullif(account.full_name, ''), 'My Company'))
    returning id into new_company;
    insert into public.company_members(company_id, user_id, role)
    values (new_company, account.id, 'owner');
  end loop;
end $$;
