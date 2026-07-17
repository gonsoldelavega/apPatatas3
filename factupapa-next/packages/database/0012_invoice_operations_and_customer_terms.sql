alter table public.contacts
  add column payment_terms_text text,
  add column default_invoice_information text,
  add column apply_invoice_defaults boolean not null default false,
  add constraint contacts_payment_terms_days_check check (payment_terms_days between 0 and 365),
  add constraint contacts_payment_terms_text_check check (payment_terms_text is null or char_length(payment_terms_text) <= 1000),
  add constraint contacts_default_invoice_information_check check (default_invoice_information is null or char_length(default_invoice_information) <= 2000);

alter table public.invoices
  add column operation_start_date date,
  add column operation_end_date date,
  add column delivery_dates date[] not null default '{}'::date[],
  add column payment_terms text,
  add column general_information text,
  add constraint invoices_operation_period_check check (operation_start_date is null or operation_end_date is null or operation_start_date <= operation_end_date),
  add constraint invoices_delivery_dates_limit_check check (cardinality(delivery_dates) <= 100),
  add constraint invoices_payment_terms_length_check check (payment_terms is null or char_length(payment_terms) <= 1000),
  add constraint invoices_general_information_length_check check (general_information is null or char_length(general_information) <= 2000);

alter table public.company_sales_preferences
  add column numbering_mode text not null default 'test' check (numbering_mode in ('test', 'live')),
  add column numbering_activated_at timestamptz,
  add column numbering_activated_by uuid,
  add constraint company_sales_preferences_numbering_actor_fk foreign key (company_id, numbering_activated_by) references public.memberships(company_id, user_id),
  add constraint company_sales_preferences_numbering_state_check check (
    (numbering_mode = 'test' and numbering_activated_at is null and numbering_activated_by is null)
    or (numbering_mode = 'live' and numbering_activated_at is not null and numbering_activated_by is not null)
  );
