alter table public.finance_loan_installments
  add column if not exists paid_at date,
  add column if not exists paid_amount numeric(14,2);

comment on column public.finance_loan_installments.paid_at
  is 'Data efetiva em que a parcela foi paga.';

comment on column public.finance_loan_installments.paid_amount
  is 'Valor efetivamente pago na parcela.';
