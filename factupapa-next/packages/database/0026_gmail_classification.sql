alter table public.gmail_purchase_imports
  drop constraint if exists gmail_purchase_imports_status_check;

alter table public.gmail_purchase_imports
  add constraint gmail_purchase_imports_status_check
  check (status in ('processing','needs_review','imported','ignored','duplicate','failed'));
