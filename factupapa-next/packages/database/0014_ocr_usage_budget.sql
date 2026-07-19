create table ocr_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  model text not null check (char_length(model) between 1 and 100),
  status text not null check (status in ('reserved','completed','failed')),
  reserved_microusd integer not null check (reserved_microusd > 0),
  actual_cost_microusd integer check (actual_cost_microusd is null or actual_cost_microusd >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (actual_cost_microusd is not null)),
  check ((status = 'reserved') = (completed_at is null))
);

create index ocr_usage_events_budget_idx
  on ocr_usage_events(company_id, created_at desc);

alter table ocr_usage_events owner to factupapa_migrator;
grant select, insert, update on ocr_usage_events to factupapa_api;

alter table ocr_usage_events enable row level security;
alter table ocr_usage_events force row level security;
create policy ocr_usage_events_tenant_isolation on ocr_usage_events
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
