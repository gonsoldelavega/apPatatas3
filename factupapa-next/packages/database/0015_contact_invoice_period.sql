alter table public.contacts
  add column invoice_period_mode text not null default 'manual',
  add constraint contacts_invoice_period_mode_check
    check (invoice_period_mode in ('manual', 'fortnightly'));
