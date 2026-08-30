-- DailyBooks: add notes and outsourced repair technician columns to public.repairs table
-- Run this in your Supabase SQL Editor:

alter table if exists public.repairs
    add column if not exists notes text,
    add column if not exists repair_performer text default 'shop',
    add column if not exists technician_name text,
    add column if not exists external_cost numeric default 0,
    add column if not exists device_location text default 'in_shop',
    add column if not exists sent_to_technician_at timestamptz,
    add column if not exists received_from_technician_at timestamptz;
