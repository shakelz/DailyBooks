-- Rename legacy repair tx_type values to previous standard value.
-- Safe to run multiple times.

begin;

update public.transactions
set
  tx_type = 'product_sale',
  type = case
    when coalesce(type, '') = '' then 'product_sale'
    when lower(type) = 'repair_amount' then 'product_sale'
    else type
  end,
  updated_at = now()
where lower(coalesce(tx_type, '')) = 'repair_amount';

commit;

