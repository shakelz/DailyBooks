-- DailyBooks: add missing repairs.advanceAmount column
-- Run once in Supabase SQL Editor.

alter table if exists public.repairs
    add column if not exists "advanceAmount" numeric default 0;
