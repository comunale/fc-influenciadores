-- O portal esconde os dados anteriores do @caiiuxo.
--
-- Reversão de um erro meu. Em 019 eu tinha tornado a parceria dele visível no
-- portal, argumentando que as 6 vendas estão marcadas como pagas e portanto
-- mostrá-las não criaria cobrança. O César já tinha decidido o contrário --
-- aqueles números são controle interno e não aparecem para o influenciador --
-- e a decisão não era minha para revisar.
--
-- Aplicada em 2026-08-19.

update public.partnerships p
   set portal_visible = false
  from public.influencers i
 where i.id = p.influencer_id
   and i.instagram_handle = '@caiiuxo';

-- A função passa a devolver o status: uma parceria oculta mas ATIVA não pode
-- ser rotulada como "encerrada" na tela.
drop function if exists public.portal_parcerias_encerradas();

create or replace function public.portal_parcerias_sem_detalhe()
returns table (id uuid, starts_at date, ends_at date, status text)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.starts_at, p.ends_at, p.status
    from public.partnerships p
   where p.influencer_id = public.meu_influencer_id()
     and p.portal_visible = false;
$$;

revoke all on function public.portal_parcerias_sem_detalhe() from public;
grant execute on function public.portal_parcerias_sem_detalhe() to authenticated;
