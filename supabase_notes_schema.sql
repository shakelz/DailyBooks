-- DailyBooks: Notes table schema with indexes and RLS policies
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

-- Enable RLS
alter table public.notes enable row level security;

-- Policy for shop data access
do $$
begin
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_shop_access'
    ) then
        create policy notes_shop_access on public.notes
            for all
            using (true)
            with check (true);
    end if;
end $$;
