alter table organizations rename to companies;
alter table companies rename constraint organizations_pkey to companies_pkey;

alter table organization_members rename to memberships;
alter table memberships rename constraint organization_members_pkey to memberships_pkey;
alter table memberships rename column organization_id to company_id;

alter table contacts rename column organization_id to company_id;
alter table products rename column organization_id to company_id;
alter table invoices rename column organization_id to company_id;
alter table payments rename column organization_id to company_id;
alter table documents rename column organization_id to company_id;
alter table audit_events rename column organization_id to company_id;
alter table import_batches rename column organization_id to company_id;

alter index contacts_org_kind_idx rename to contacts_company_kind_idx;
alter index invoices_org_status_idx rename to invoices_company_status_idx;
alter index documents_org_status_idx rename to documents_company_status_idx;

alter table users
  add column is_active boolean not null default true,
  add column last_login_at timestamptz,
  add constraint users_password_hash_argon2id_check
    check (password_hash is null or password_hash like '$argon2id$%');

alter table audit_events alter column company_id drop not null;
alter table audit_events add column event_uuid uuid not null default gen_random_uuid();
alter table audit_events drop constraint audit_events_pkey;
alter table audit_events drop column id;
alter table audit_events rename column event_uuid to id;
alter table audit_events add primary key (id);

alter table contacts add constraint contacts_company_id_id_key unique (company_id, id);
alter table products add constraint products_company_id_id_key unique (company_id, id);
alter table invoices add constraint invoices_company_id_id_key unique (company_id, id);

alter table invoices
  add constraint invoices_company_contact_fk
  foreign key (company_id, contact_id) references contacts(company_id, id);

alter table invoice_lines add column company_id uuid;
update invoice_lines as line
set company_id = invoice.company_id
from invoices as invoice
where invoice.id = line.invoice_id;
alter table invoice_lines alter column company_id set not null;
alter table invoice_lines
  add constraint invoice_lines_company_fk
    foreign key (company_id) references companies(id) on delete cascade,
  add constraint invoice_lines_company_invoice_fk
    foreign key (company_id, invoice_id) references invoices(company_id, id) on delete cascade,
  add constraint invoice_lines_company_product_fk
    foreign key (company_id, product_id) references products(company_id, id);
create index invoice_lines_company_invoice_idx on invoice_lines(company_id, invoice_id, position);

alter table payments
  add constraint payments_company_invoice_fk
    foreign key (company_id, invoice_id) references invoices(company_id, id),
  add constraint payments_company_contact_fk
    foreign key (company_id, contact_id) references contacts(company_id, id);

alter table documents
  add constraint documents_company_invoice_fk
    foreign key (company_id, invoice_id) references invoices(company_id, id);

create index products_company_active_idx on products(company_id, active, name);
create index memberships_user_company_idx on memberships(user_id, company_id);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  company_id uuid not null,
  user_id uuid not null,
  refresh_token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  rotated_to_id uuid references auth_sessions(id) on delete set null,
  constraint auth_sessions_membership_fk
    foreign key (company_id, user_id) references memberships(company_id, user_id) on delete cascade,
  constraint auth_sessions_expiry_check check (expires_at > created_at),
  constraint auth_sessions_revocation_check
    check ((revoked_at is null and revocation_reason is null) or
           (revoked_at is not null and revocation_reason is not null))
);

create index auth_sessions_active_user_idx
  on auth_sessions(company_id, user_id, expires_at)
  where revoked_at is null;
create index auth_sessions_family_idx on auth_sessions(family_id, created_at desc);
create index audit_events_auth_action_idx on audit_events(action, created_at desc)
  where action like 'auth.%';
