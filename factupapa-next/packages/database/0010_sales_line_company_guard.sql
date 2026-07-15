begin;

create function public.reject_sales_line_company_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'A sales document line cannot change company'
      using errcode = '55000';
  end if;
  return new;
end
$function$;

alter function public.reject_sales_line_company_change() owner to factupapa_migrator;
revoke all on function public.reject_sales_line_company_change() from public;

create trigger aa_invoice_lines_reject_company_change
before update of company_id on public.invoice_lines
for each row execute function public.reject_sales_line_company_change();

create trigger aa_delivery_note_lines_reject_company_change
before update of company_id on public.delivery_note_lines
for each row execute function public.reject_sales_line_company_change();

commit;
