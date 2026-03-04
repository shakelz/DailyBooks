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

grant execute on function public.make_pin_digest_global(text) to anon, authenticated, service_role;
grant execute on function public.verify_salesman_pin(text, text) to anon, authenticated, service_role;

commit;
