create extension if not exists pgcrypto;

create table if not exists public.planejamento_metas_mensais (
  id uuid primary key default gen_random_uuid(),
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  meta_amount numeric(14,2) not null default 0,
  actual_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  constraint planejamento_metas_mensais_year_month_unique
    unique (reference_year, reference_month)
);

create index if not exists idx_planejamento_metas_mensais_year
  on public.planejamento_metas_mensais(reference_year);

create index if not exists idx_planejamento_metas_mensais_year_month
  on public.planejamento_metas_mensais(reference_year, reference_month);

alter table public.planejamento_metas_mensais enable row level security;

drop policy if exists planejamento_metas_mensais_authenticated_all
  on public.planejamento_metas_mensais;

create policy planejamento_metas_mensais_authenticated_all
  on public.planejamento_metas_mensais
  for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_planejamento_metas_mensais_updated_at'
    ) then
      create trigger trg_planejamento_metas_mensais_updated_at
      before update on public.planejamento_metas_mensais
      for each row
      execute function public.set_updated_at();
    end if;
  end if;
end $$;

comment on table public.planejamento_metas_mensais is 'Metas mensais do módulo Planejamento';
comment on column public.planejamento_metas_mensais.meta_amount is 'Valor meta do mês';
comment on column public.planejamento_metas_mensais.actual_amount is 'Valor realizado do mês';
comment on column public.planejamento_metas_mensais.notes is 'Observações da meta mensal';
