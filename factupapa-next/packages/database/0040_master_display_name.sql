-- El nombre visible del usuario maestro salía como «Usuario Demo Ficticio» (dato de arranque).
-- Solo se corrige si todavía contiene «demo»; si ya se cambió a mano, no se toca.
update public.users as u
set display_name = 'Nando', updated_at = now()
where lower(u.email::text) = 'nandoplas@gmail.com'
  and u.display_name ilike '%demo%'
  and exists (select 1 from public.memberships as m where m.user_id = u.id and m.role = 'owner');
