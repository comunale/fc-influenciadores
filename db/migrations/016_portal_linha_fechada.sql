-- A parceria encerrada precisa APARECER sem se ABRIR.
--
-- A migration 014 deixou `partnerships_select_influencer` exigir
-- portal_visible = true. Isso protege os valores das parcerias antigas -- que
-- vieram de planilha e já foram acertadas por fora -- mas esconde a linha
-- inteira, e aí o influenciador acha que o histórico dele sumiu.
--
-- Não dá para relaxar a política: o influenciador tem sessão de verdade e pode
-- consultar a API direto, então soltar a linha soltaria fee e comissão junto.
--
-- Esta função é a saída: devolve só as datas das parcerias encerradas DELE.
-- Sem fee, sem comissão, sem desconto. É o suficiente para escrever
-- "Parceria de 12/05 a 11/07 · encerrada · sem detalhes" e nada mais.
--
-- Aplicada em 2026-08-19.

create or replace function public.portal_parcerias_encerradas()
returns table (id uuid, starts_at date, ends_at date)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.starts_at, p.ends_at
    from public.partnerships p
   where p.influencer_id = public.meu_influencer_id()
     and p.portal_visible = false;
$$;

-- Security definer roda com os privilégios do dono: quem pode executar precisa
-- ser dito na mão. `meu_influencer_id()` devolve null para usuário interno,
-- então para eles a função não retorna nada -- o que é o certo, o admin tem a
-- tela dele.
revoke all on function public.portal_parcerias_encerradas() from public;
grant execute on function public.portal_parcerias_encerradas() to authenticated;
