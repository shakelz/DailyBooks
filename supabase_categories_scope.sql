-- DailyBooks: persist category scope in DB (sales/revenue)
-- Run once in Supabase SQL Editor.

alter table if exists public.categories
    add column if not exists scope text default 'sales';

update public.categories
set scope = coalesce(nullif(scope, ''), 'sales')
where scope is null or scope = '';
