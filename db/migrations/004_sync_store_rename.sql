-- 004_sync_store_rename.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- A loja nao e uma entidade: ela existe como TEXTO em admin_profiles.store_name
-- e e referenciada por igualdade exata em sellers.store_name. Renomear a loja
-- num login orfanava os vendedores em silencio -- a lista do balcao ficava vazia
-- sem erro nenhum na tela.
--
-- Este trigger trata o nome da loja como a identidade dela: renomeou num lugar,
-- renomeia em todos. pg_trigger_depth() > 1 impede recursao quando o proprio
-- UPDATE abaixo dispara este mesmo trigger de novo.

create or replace function public.sync_store_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.store_name is distinct from old.store_name
     and old.store_name is not null
     and btrim(old.store_name) <> '' then

    update public.sellers
       set store_name = new.store_name
     where store_name = old.store_name;

    update public.admin_profiles
       set store_name = new.store_name
     where store_name = old.store_name
       and id <> new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_store_rename on public.admin_profiles;
create trigger sync_store_rename
  after update of store_name on public.admin_profiles
  for each row execute function public.sync_store_rename();
