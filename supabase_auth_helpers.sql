-- DailyBooks auth helper updates for:
-- 1) admin/owner login with email or username
-- 2) globally unique salesman PIN digest
-- Run this in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists username text,
  add column if not exists pin_digest text;

create unique index if not exists uq_profiles_username
on public.profiles(username)
where username is not null and username <> '';

create unique index if not exists uq_profiles_pin_digest_global
on public.profiles(pin_digest)
where pin_digest is not null and pin_digest <> '';

create or replace function public.make_pin_digest_global(p_pin text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(p_pin, ''), 'sha256'), 'hex');
$$;

create or replace function public.verify_salesman_pin(p_pin text, p_shop_id text default null)
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text := trim(coalesce(p_pin, ''));
  v_shop text := trim(coalesce(p_shop_id, ''));
  v_digest text;
begin
  if v_pin = '' then
    return;
  end if;

  v_digest := public.make_pin_digest_global(v_pin);

  return query
  select p.*
  from public.profiles p
  where lower(coalesce(p.role, '')) = 'salesman'
    and coalesce(p.active, true) = true
    and (v_shop = '' or coalesce(p.shop_id, '') = v_shop)
    and (
      coalesce(p.pin_digest, '') = v_digest
      or (coalesce(p.pin_digest, '') = '' and coalesce(p.pin, '') = v_pin)
    )
  limit 2;
end;
$$;

create or replace function public.resolve_admin_auth_email(p_identifier text)
returns table (
  auth_email text,
  profile_id text,
  role text,
  shop_id text
)
language sql
security definer
set search_path = public
as $$
  with input_key as (
    select lower(trim(coalesce(p_identifier, ''))) as identifier
  ),
  admin_profiles as (
    select
      coalesce(nullif(to_jsonb(p) ->> 'user_id', ''), nullif(to_jsonb(p) ->> 'id', '')) as profile_id,
      coalesce(nullif(to_jsonb(p) ->> 'user_id', ''), nullif(to_jsonb(p) ->> 'id', '')) as linked_user_id,
      lower(coalesce(to_jsonb(p) ->> 'role', '')) as role,
      coalesce(to_jsonb(p) ->> 'shop_id', '') as shop_id,
      coalesce((nullif(to_jsonb(p) ->> 'created_at', ''))::timestamptz, now()) as created_at
    from public.profiles p
    cross join input_key i
    where lower(coalesce(to_jsonb(p) ->> 'role', '')) in ('owner', 'super_admin', 'admin', 'superadmin', 'superuser')
      and (
        lower(coalesce(to_jsonb(p) ->> 'username', '')) = i.identifier
        or lower(coalesce(to_jsonb(p) ->> 'name', '')) = i.identifier
        or lower(coalesce(to_jsonb(p) ->> 'full_name', '')) = i.identifier
        or (
          position('@' in i.identifier) > 0
          and exists (
            select 1
            from public.shops s
            where (
              coalesce(to_jsonb(s) ->> 'shop_id', '') = coalesce(to_jsonb(p) ->> 'shop_id', '')
              or coalesce(to_jsonb(s) ->> 'id', '') = coalesce(to_jsonb(p) ->> 'shop_id', '')
            )
              and lower(coalesce(s.owner_email, '')) = i.identifier
          )
        )
      )
    order by p.created_at desc nulls last
    limit 25
  ),
  resolved_users as (
    select
      ap.profile_id,
      ap.role,
      ap.shop_id,
      case
        when ap.linked_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then ap.linked_user_id::uuid
        else null
      end as auth_uid
    from admin_profiles ap
  )
  select
    au.email::text as auth_email,
    ru.profile_id,
    ru.role,
    ru.shop_id
  from resolved_users ru
  join auth.users au on au.id = ru.auth_uid
  where coalesce(au.email, '') <> ''
  limit 1;
$$;

grant execute on function public.make_pin_digest_global(text) to anon, authenticated, service_role;
grant execute on function public.verify_salesman_pin(text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_admin_auth_email(text) to anon, authenticated, service_role;

commit;
