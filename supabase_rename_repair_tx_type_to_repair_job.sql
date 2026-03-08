-- Rename legacy repair tx_type values to repair_job.
-- Safe to run multiple times.

begin;

update public.transactions
set
  tx_type = 'repair_job',
  type = case
    when coalesce(type, '') = '' then 'repair_job'
    when lower(type) in ('repair_amount', 'repair', 'reparing_job', 'product_sale', 'sale', 'income') then 'repair_job'
    else type
  end,
  updated_at = now()
where (lower(coalesce(source, tx_source, '')) = 'repair'
    or lower(coalesce(source, tx_source, '')) like 'repair-%'
    or lower(coalesce(source, tx_source, '')) like 'repair_%')
  and (
    lower(coalesce(tx_type, '')) in ('repair_amount', 'repair', 'reparing_job', 'product_sale', 'sale', 'income')
    or lower(coalesce(type, '')) in ('repair_amount', 'repair', 'reparing_job', 'product_sale', 'sale', 'income')
  );

commit;
