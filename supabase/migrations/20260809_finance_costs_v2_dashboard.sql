create extension if not exists pgcrypto;

create table if not exists public.finance_cost_settings (
  singleton_key text primary key default 'default',
  estimated_revenue numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.finance_cost_settings (singleton_key, estimated_revenue)
values ('default', 0)
on conflict (singleton_key) do nothing;

create table if not exists public.finance_cost_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('fixo', 'variavel')),
  description text not null,
  cost_type text not null,
  supplier text,
  due_day integer null check (due_day between 1 and 31),
  monthly_amount numeric(14,2) not null default 0,
  percentage_rate numeric(10,4) not null default 0,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_cost_entries_category
  on public.finance_cost_entries(category);

create index if not exists idx_finance_cost_entries_status
  on public.finance_cost_entries(status);

create index if not exists idx_finance_cost_entries_created_at
  on public.finance_cost_entries(created_at desc);
