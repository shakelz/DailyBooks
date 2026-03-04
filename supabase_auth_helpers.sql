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
      lower(coalesce(to_jsonb(p) ->> 'username', '')) as username,
      lower(coalesce(to_jsonb(p) ->> 'name', '')) as profile_name,
      lower(coalesce(to_jsonb(p) ->> 'full_name', '')) as profile_full_name,
      lower(coalesce(to_jsonb(p) ->> 'email', '')) as profile_email,
      coalesce((nullif(to_jsonb(p) ->> 'created_at', ''))::timestamptz, now()) as created_at
    from public.profiles p
    where lower(coalesce(to_jsonb(p) ->> 'role', '')) in ('owner', 'super_admin', 'admin', 'superadmin', 'superuser')
  ),
  resolved_users as (
    select
      ap.*,
      case
        when ap.linked_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then ap.linked_user_id::uuid
        else null
      end as auth_uid
    from admin_profiles ap
  ),
  joined as (
    select
      ru.profile_id,
      ru.role,
      ru.shop_id,
      ru.username,
      ru.profile_name,
      ru.profile_full_name,
      ru.profile_email,
      ru.created_at,
      au.email::text as auth_email
    from resolved_users ru
    left join auth.users au on au.id = ru.auth_uid
  )
  select
    j.auth_email,
    j.profile_id,
    j.role,
    j.shop_id
  from joined j
  cross join input_key i
  where i.identifier <> ''
    and (
      j.username = i.identifier
      or j.profile_name = i.identifier
      or j.profile_full_name = i.identifier
      or (position('@' in i.identifier) > 0 and lower(coalesce(j.auth_email, '')) = i.identifier)
      or (position('@' in i.identifier) > 0 and j.profile_email = i.identifier)
      or (
        position('@' in i.identifier) > 0
        and exists (
          select 1
          from public.shops s
          where lower(coalesce(to_jsonb(s) ->> 'owner_email', '')) = i.identifier
            and (
              coalesce(to_jsonb(s) ->> 'shop_id', '') = j.shop_id
              or coalesce(to_jsonb(s) ->> 'id', '') = j.shop_id
            )
        )
      )
    )
    and coalesce(j.auth_email, '') <> ''
  order by j.created_at desc nulls last
  limit 1;
$$;

create or replace function public.create_or_link_shop_owner_profile(
  p_shop_id text,
  p_owner_user_id text default null,
  p_owner_name text default null,
  p_owner_email text default null,
  p_role text default 'owner'
)
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text := trim(coalesce(p_shop_id, ''));
  v_owner_user_id text := trim(coalesce(p_owner_user_id, ''));
  v_owner_name text := trim(coalesce(p_owner_name, ''));
  v_owner_email text := lower(trim(coalesce(p_owner_email, '')));
  v_role text := lower(trim(coalesce(p_role, 'owner')));
  v_has_email boolean := false;
begin
  if v_shop_id = '' then
    raise exception 'shop_id is required';
  end if;

  if v_role not in ('owner', 'super_admin') then
    v_role := 'owner';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) into v_has_email;

  return query
  with matched as (
    select p.*
    from public.profiles p
    where lower(coalesce(p.role, '')) in ('owner', 'super_admin', 'admin', 'superadmin', 'superuser')
      and (
        (v_owner_user_id <> '' and coalesce(to_jsonb(p) ->> 'user_id', '') = v_owner_user_id)
        or (v_owner_email <> '' and v_has_email and lower(coalesce(to_jsonb(p) ->> 'email', '')) = v_owner_email)
      )
    order by coalesce((nullif(to_jsonb(p) ->> 'created_at', ''))::timestamptz, now()) desc
    limit 1
  ), updated as (
    update public.profiles p
    set
      shop_id = v_shop_id,
      full_name = case when v_owner_name <> '' then v_owner_name else p.full_name end,
      role = case when lower(coalesce(p.role, '')) = 'super_admin' then p.role else v_role end,
      active = true
    where p.ctid in (select m.ctid from matched m)
    returning p.*
  )
  select * from updated;

  if found then
    return;
  end if;

  begin
    if v_has_email and v_owner_email <> '' then
      return query
      insert into public.profiles (user_id, shop_id, full_name, email, role, active, is_online)
      values (nullif(v_owner_user_id, '')::uuid, v_shop_id, nullif(v_owner_name, ''), v_owner_email, v_role, true, false)
      returning *;
      return;
    end if;

    return query
    insert into public.profiles (user_id, shop_id, full_name, role, active, is_online)
    values (nullif(v_owner_user_id, '')::uuid, v_shop_id, nullif(v_owner_name, ''), v_role, true, false)
    returning *;
    return;
  exception when others then
    if v_has_email and v_owner_email <> '' then
      return query
      insert into public.profiles (shop_id, full_name, email, role, active, is_online)
      values (v_shop_id, nullif(v_owner_name, ''), v_owner_email, v_role, true, false)
      returning *;
      return;
    end if;

    return query
    insert into public.profiles (shop_id, full_name, role, active, is_online)
    values (v_shop_id, nullif(v_owner_name, ''), v_role, true, false)
    returning *;
  end;
end;
$$;

grant execute on function public.make_pin_digest_global(text) to anon, authenticated, service_role;
grant execute on function public.verify_salesman_pin(text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_admin_auth_email(text) to anon, authenticated, service_role;
grant execute on function public.create_or_link_shop_owner_profile(text, text, text, text, text) to anon, authenticated, service_role;

commit;
