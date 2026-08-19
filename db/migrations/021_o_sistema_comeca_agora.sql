-- O sistema começa agora.
--
-- Regra dada pelo César em 19/08: *"A partir de agora a gente contabiliza. O que
-- é passado é passado. O sistema começou agora com o Caio e com a Mariana."*
--
-- Isso resolve, de uma vez, a confusão que vinha se arrastando sobre o que o
-- portal mostra do histórico. A resposta passa a ser simples: **nada**. Se o
-- sistema começa hoje, não existe passado para o influenciador ver, e uma linha
-- vazia dizendo "parceria anterior, sem detalhes" só levantaria a pergunta que
-- a decisão quis evitar.
--
-- Para o @caiiuxo, cuja parceria de 25/05 carregava as 6 vendas já acertadas por
-- fora: a parceria antiga encerra em 18/08 e uma nova nasce em 19/08 com os
-- MESMOS termos (R$ 500 por venda, R$ 300 de desconto, 60 dias, sem fee). As 6
-- vendas ficam presas à parceria antiga -- o retrato gravado em cada cupom
-- garante que renovar não reescreve o passado -- e o portal dele parte do zero.
--
-- A @mariananavi não precisa de nada: a parceria dela é de 12/08 e não tem venda
-- concluída. Já é a parceria nova.
--
-- Aplicada em 2026-08-19.

update public.partnerships p
   set status = 'encerrada', ends_at = date '2026-08-18'
  from public.influencers i
 where i.id = p.influencer_id and i.instagram_handle = '@caiiuxo' and p.status = 'ativa';

insert into public.partnerships (
  influencer_id, campaign_id, status, starts_at, ends_at,
  fee_amount, fee_timing, commission_per_sale, commission_starts_at,
  commission_counts_from, payment_schedule, discount_type, discount_value,
  validity_days, coupon_title, coupon_description, portal_visible
)
select p.influencer_id, p.campaign_id, 'ativa', date '2026-08-19', null,
       p.fee_amount, p.fee_timing, p.commission_per_sale, p.commission_starts_at,
       p.commission_counts_from, p.payment_schedule, p.discount_type, p.discount_value,
       p.validity_days, p.coupon_title, p.coupon_description, true
  from public.partnerships p
  join public.influencers i on i.id = p.influencer_id
 where i.instagram_handle = '@caiiuxo'
   and p.status = 'encerrada' and p.ends_at = date '2026-08-18';

-- Nem como linha vazia. A função criada em 016 deixa de existir.
drop function if exists public.portal_parcerias_sem_detalhe();
