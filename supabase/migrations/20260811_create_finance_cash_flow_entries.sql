create extension if not exists pgcrypto;

create table if not exists public.finance_cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  type text not null check (type in ('receita', 'despesa')),
  category text not null,
  description text not null default '',
  amount numeric(14,2) not null default 0,
  auto_generated boolean not null default false,
  source text null,
  source_reference_id text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_cash_flow_entries_year_month
  on public.finance_cash_flow_entries(year, month);

create index if not exists idx_finance_cash_flow_entries_type
  on public.finance_cash_flow_entries(type);

create index if not exists idx_finance_cash_flow_entries_active
  on public.finance_cash_flow_entries(active);

create or replace function public.set_finance_cash_flow_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;

$$;

drop trigger if exists trg_finance_cash_flow_entries_updated_at
on public.finance_cash_flow_entries;

create trigger trg_finance_cash_flow_entries_updated_at
before update on public.finance_cash_flow_entries
for each row
execute function public.set_finance_cash_flow_entries_updated_at();
