-- DailyBooks: delete all data from app tables
-- Run once in Supabase SQL Editor.

begin;

truncate table
    public.attendance,
    public.transactions,
    public.repairs,
    public.inventory,
    public.categories,
    public.profiles,
    public.shops,
    public.app_state
restart identity cascade;

commit;
