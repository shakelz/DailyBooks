-- DailyBooks: profiles cleanup + compatibility migration
-- Run this once in Supabase SQL Editor.

begin;

-- Ensure columns used by current app writes exist.
alter table if exists public.profiles
    add column if not exists avatar_url text,
    add column if not exists salesman_number integer,
    add column if not exists can_edit_transactions boolean not null default false,
    add column if not exists can_bulk_edit boolean not null default false;

-- Backfill snake_case permission/number columns from legacy/camel-case equivalents where possible.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'salesmannumber'
    ) then
        execute 'update public.profiles set salesman_number = coalesce(salesman_number, salesmannumber) where salesman_number is null';
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'canedittransactions'
    ) then
        execute 'update public.profiles set can_edit_transactions = coalesce(can_edit_transactions, canedittransactions, false)';
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'canbulkedit'
    ) then
        execute 'update public.profiles set can_bulk_edit = coalesce(can_bulk_edit, canbulkedit, false)';
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'photo'
    ) then
        execute $$update public.profiles
                 set avatar_url = coalesce(nullif(avatar_url, ''), photo)
                 where coalesce(nullif(avatar_url, ''), '') = ''$$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'photo_url'
    ) then
        execute $$update public.profiles
                 set avatar_url = coalesce(nullif(avatar_url, ''), photo_url)
                 where coalesce(nullif(avatar_url, ''), '') = ''$$;
    end if;

    -- Backfill canonical pin from old aliases before dropping.
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'passcode'
    ) then
        execute $$update public.profiles
                 set pin = coalesce(nullif(pin, ''), passcode)
                 where coalesce(nullif(pin, ''), '') = ''$$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'pin_code'
    ) then
        execute $$update public.profiles
                 set pin = coalesce(nullif(pin, ''), pin_code)
                 where coalesce(nullif(pin, ''), '') = ''$$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'pass_code'
    ) then
        execute $$update public.profiles
                 set pin = coalesce(nullif(pin, ''), pass_code)
                 where coalesce(nullif(pin, ''), '') = ''$$;
    end if;
end
$$;

-- Remove unused legacy aliases to reduce table width.
alter table if exists public.profiles
    drop column if exists passcode,
    drop column if exists pin_code,
    drop column if exists pass_code;

commit;
