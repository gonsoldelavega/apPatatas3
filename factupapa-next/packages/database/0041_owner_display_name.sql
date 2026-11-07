-- Corrige el nombre visible «Usuario Demo Ficticio» de los usuarios propietarios (dato de arranque).
-- Solo toca nombres que aún contienen «demo»; no depende del correo con el que se entre.
update public.users as u
set display_name = 'Nando', updated_at = now()
where u.display_name ilike '%demo%'
  and exists (select 1 from public.memberships as m where m.user_id = u.id and m.role = 'owner');
