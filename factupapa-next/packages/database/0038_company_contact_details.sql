-- Datos de contacto de la empresa (correo y web) y datos actuales del emisor.
-- Migración aditiva: dos columnas nuevas, permiso de edición solo sobre esas columnas
-- y un ajuste puntual de los datos de la empresa principal.

alter table companies
  add column email text
    check (email is null or (char_length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column website text
    check (website is null or (char_length(website) <= 200 and website !~ '[[:space:]]'));

-- La API puede editar solo estas columnas de su propia empresa (la política RLS ya limita la fila).
grant update (email, website, address) on companies to factupapa_api;

-- Datos actuales de la empresa principal (la que tiene facturas). En una base vacía no hace nada.
update companies
   set email = 'contacto@origenpatatas.com',
       website = 'origenpatatas.com',
       address = jsonb_build_object(
         'street', 'Calle Antoñete s/n',
         'postalCode', '04741',
         'city', 'Cortijos de Marín'
       )
 where id = (
   select company_id from invoices group by company_id order by count(*) desc, company_id limit 1
 );
