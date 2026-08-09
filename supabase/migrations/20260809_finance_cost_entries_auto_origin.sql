alter table public.finance_cost_entries
  add column if not exists origin_module text;

alter table public.finance_cost_entries
  add column if not exists origin_contract_id text;

alter table public.finance_cost_entries
  add column if not exists auto_generated boolean not null default false;

alter table public.finance_cost_entries
  add column if not exists allow_manual_edit boolean not null default true;

alter table public.finance_cost_entries
  add column if not exists allow_manual_delete boolean not null default true;

create index if not exists idx_finance_cost_entries_origin_module
  on public.finance_cost_entries(origin_module);

create index if not exists idx_finance_cost_entries_origin_contract_id
  on public.finance_cost_entries(origin_contract_id);

create unique index if not exists idx_finance_cost_entries_origin_unique
  on public.finance_cost_entries(origin_module, origin_contract_id)
  where origin_module is not null and origin_contract_id is not null;
