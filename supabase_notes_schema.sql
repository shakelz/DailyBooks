-- DailyBooks: Notes table schema with permissions
-- Run this in your Supabase SQL Editor:

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

-- Performance indexes
create index if not exists idx_notes_shop_id on public.notes(shop_id);
create index if not exists idx_notes_created_at on public.notes(created_at);
create index if not exists idx_notes_archived on public.notes(is_archived);

-- Disable RLS so client operations are not blocked by missing policies
alter table if exists public.notes disable row level security;

-- Grant permissions to standard Supabase roles
grant all on table public.notes to anon, authenticated, service_role;
