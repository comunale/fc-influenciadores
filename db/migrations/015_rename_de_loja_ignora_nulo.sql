-- O gatilho de renomear loja não pode tratar "deixou de ter loja" como rename.
--
-- Encontrado em 2026-08-19, testando a migration 014. Trocar o papel de um
-- Lojista para Financeiro faz `store_name` virar nulo (é o que /api/admin/
-- update-user grava quando o papel deixa de ser moderator). O gatilho lia isso
-- como um rename para nulo e tentava apagar o nome da loja dos vendedores --
-- coluna que não aceita nulo. Resultado: erro cru do Postgres na tela e a troca
-- de papel simplesmente não acontecia.
--
-- Perder o vínculo com a loja num login não apaga a loja: ela continua
-- existindo, com os vendedores dela e possivelmente outros Lojistas. Rename é
-- de um nome para outro nome.
--
-- Aplicada em 2026-08-19.

create or replace function public.sync_store_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.store_name is distinct from old.store_name
     and old.store_name is not null
     and btrim(old.store_name) <> ''
     -- Sem destino não é rename: o login só deixou de pertencer à loja.
     and new.store_name is not null
     and btrim(new.store_name) <> '' then

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
