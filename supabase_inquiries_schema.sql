-- DailyBooks: Website Customer Inquiries Schema & Permissions
-- Run this in your Supabase SQL Editor:

-- 1. Create inquiries table
create table if not exists public.inquiries (
    id text primary key default ('inq_' || floor(extract(epoch from now()) * 1000)::text),
    shop_id text references public.shops(id) on delete set null,
    customer_name text not null,
    customer_phone text not null,
    device_model text,
    issue_description text,
    status text not null default 'new',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Performance indexes
create index if not exists idx_inquiries_shop_id on public.inquiries(shop_id);
create index if not exists idx_inquiries_created_at on public.inquiries(created_at);
create index if not exists idx_inquiries_status on public.inquiries(status);

-- 3. Ensure permissions for notes table (so public website inquiries sync seamlessly to Salesman Dashboard)
create table if not exists public.notes (
    id text primary key,
    shop_id text not null,
    title text,
    content text not null,
    category text default 'general',
    color text default 'amber',
    is_pinned boolean default false,
    is_archived boolean default false,
    author_name text,
    created_by text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 4. Disable RLS or grant open access to anon/authenticated for website inquiries and notes
alter table if exists public.inquiries disable row level security;
alter table if exists public.notes disable row level security;

grant all on table public.inquiries to anon, authenticated, service_role;
grant all on table public.notes to anon, authenticated, service_role;
