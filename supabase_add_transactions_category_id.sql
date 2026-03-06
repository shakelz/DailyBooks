-- Add optional category_id in transactions table (standalone migration)
-- Safe to run multiple times.

begin;

alter table if exists public.transactions
  add column if not exists category_id text;

create index if not exists idx_transactions_shop_category_id
  on public.transactions(shop_id, category_id);

commit;
