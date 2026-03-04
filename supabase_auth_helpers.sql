-- DailyBooks auth helper updates for:
-- 1) admin/owner login with email or username
-- 2) globally unique salesman PIN digest
-- Run this in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

alter table if exists public.profiles
    add column if not exists username text;

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

commit;
