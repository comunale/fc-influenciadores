-- Encerra as 15 parcerias da reinauguração que nunca geraram um cupom.
--
-- Descoberto em 2026-08-19: o César acreditava ter 2 parcerias ativas, e o
-- sistema tinha 18 -- todas sem `ends_at`, e parceria sem prazo não vence.
-- Ou seja, 18 links no ar.
--
-- Não era descuido de ninguém. Até 18/08 a parceria não existia como entidade;
-- quando passou a existir, os dados vieram da planilha da reinauguração, sem
-- data de fim, porque a planilha não tinha esse campo.
--
-- O risco era concreto: qualquer uma dessas pessoas ainda tinha o link vivo. Um
-- story antigo salvo, um print repassado, e o cupom nasceria válido -- custando
-- o desconto MAIS R$ 500 de comissão de um acordo encerrado em maio.
--
-- Critério: parceria ativa cujo influenciador nunca gerou nenhum cupom. Deixa
-- de fora @caiiuxo (6 cupons), @mariananavi (1) e @carolvilex (1), que ficam
-- ativas. `ends_at` retroage a 2026-05-23, o último início da leva.
--
-- Depois disso: 3 ativas, 15 encerradas. As pessoas continuam no cadastro --
-- encerrar acordo não é apagar quem trabalhou com a gente, e o histórico delas
-- segue no portal como linha fechada.
--
-- Aplicada em 2026-08-19.

with alvo as (
  select p.id
    from public.partnerships p
   where p.status = 'ativa'
     and not exists (
       select 1 from public.coupons c where c.influencer_id = p.influencer_id
     )
)
update public.partnerships p
   set status = 'encerrada',
       ends_at = coalesce(p.ends_at, date '2026-05-23')
  from alvo
 where p.id = alvo.id;
