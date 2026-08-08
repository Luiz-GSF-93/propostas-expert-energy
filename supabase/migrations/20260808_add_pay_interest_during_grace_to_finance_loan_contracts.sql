alter table public.finance_loan_contracts
  add column if not exists pay_interest_during_grace boolean not null default false;

comment on column public.finance_loan_contracts.pay_interest_during_grace
is 'Indica se durante a carência são pagos apenas juros mensais.';

update public.finance_loan_contracts
set pay_interest_during_grace = false
where pay_interest_during_grace is distinct from false;
