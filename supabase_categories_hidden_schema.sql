-- Add is_hidden column to public.categories table
-- Run this in your Supabase SQL Editor:

alter table if exists public.categories
add column if not exists is_hidden boolean default false;

create index if not exists idx_categories_is_hidden on public.categories(is_hidden);
