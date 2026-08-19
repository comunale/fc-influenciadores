-- Fecha o inventario de parcerias e acerta o que o portal mostra.
--
-- 2026-08-19. O Cesar confirmou: "hoje so temos ativos Caiuxo e Mari Navi,
-- restante esta finalizada".
--
-- 1) @carolvilex encerra junto com as 15 da migration 018. Ela tinha ficado de
--    fora por ter gerado um cupom em maio.
--
--    ATENCAO -- pendencia que sobrevive ao encerramento: o cupom FOX-ZE679B,
--    de 22/05, esta como USADO mas nunca foi conferido pelo Financeiro. A moto
--    saiu e a comissao nao conta ate alguem conferir. Ha tambem R$ 500 de fee
--    registrado na parceria dela. Encerrar nao apaga nada disso -- o cupom e o
--    calculo continuam la. Registrado no BACKLOG.
--
-- 2) As duas parcerias ativas voltam a ser visiveis no portal. A migration 014
--    marcou TODAS as 18 como ocultas, tratando-as como historico de planilha.
--    Para estas duas isso estava errado: sao acordos EM ANDAMENTO, e o
--    influenciador entraria no portal para ver "parceria encerrada, sem
--    detalhes" de uma parceria viva.
--
--    O receio original -- criar cobranca sobre o que ja foi acertado por fora --
--    nao se aplica: as 6 vendas do @caiiuxo estao marcadas como PAGAS, entao o
--    portal mostra R$ 3.000 gerados e R$ 3.000 pagos. Mostra quitado.
--
--    A linha fechada segue valendo para as 16 encerradas.
--
-- Aplicada em 2026-08-19.

update public.partnerships p
   set status = 'encerrada', ends_at = coalesce(p.ends_at, date '2026-05-23')
  from public.influencers i
 where i.id = p.influencer_id
   and i.instagram_handle = '@carolvilex'
   and p.status = 'ativa';

update public.partnerships p
   set portal_visible = true
  from public.influencers i
 where i.id = p.influencer_id
   and i.instagram_handle in ('@caiiuxo', '@mariananavi')
   and p.status = 'ativa';
